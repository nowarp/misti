import { InternalException } from "../../internals/exceptions";
import { BasicBlock, CFG, CompilationUnit } from "../../internals/ir";
import { JoinSemilattice } from "../../internals/lattice";
import { WorklistSolver } from "../../internals/solver/";
import { getMethodCallsChain, isStdlibCall } from "../../internals/tact/";
import { forEachExpression } from "../../internals/tact/iterators";
import { Transfer } from "../../internals/transfer";
import {
  mergeLists,
  isListSubsetOf,
  mergeMaps,
  isMapSubsetOf,
  unreachable,
} from "../../internals/util";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { DataflowDetector } from "../detector";
import {
  AstStatement,
  AstStatementLet,
  AstId,
  AstExpression,
  SrcInfo,
  idText,
  AstMethodCall,
  AstStatementAssign,
} from "@tact-lang/compiler/dist/grammar/ast";

type VariableName = string & { readonly __brand: unique symbol };
enum VariableKind {
  Builder = "builder",
  Cell = "cell",
  Slice = "slice",
  Message = "message",
  Struct = "struct",
}

type Variable = {
  /**
   * Name of the variable. `undefined` if it is an intermediate variable, e.g.:
   * ```
   * self.processCell(beginCell().storeBool(true).endCell());
   *                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   *                        intermediate Cell variable
   * ```
   */
  name: VariableName | undefined;
  kind: VariableKind;
  /** Location of definition. */
  loc: SrcInfo;
  /**
   * Method calls over this variable.
   * These don't include the first (receiver) expression in the calls chain:
   * ```
   * beginCell().storeBool(true).endCell();
   * ^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^
   * not included         calls
   * ```
   */
  calls: Map<AstMethodCall["id"], AstMethodCall>;
};

type UnknownVariable = Omit<Variable, "name" | "loc">;

/**
 * Variable expression appearing in the rhs of the variable defintion or assignment.
 */
type VariableRhs =
  /**
   * New value created from the source unknown in dataflow:
   * ```tact
   * let c: Cell = beginCell().storeBool(true).endCell();
   *               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   * ```
   */
  | { kind: "unknown"; value: UnknownVariable }
  /**
   * New value created from the known local variable:
   * ```tact
   * let c: Cell = emptyCell();
   * let s: Slice = c.asSlice();
   *                ^^^^^^^^^^^
   * ```
   */
  | { kind: "known"; value: Variable };

/**
 * Describes dataflow state of local variables which uses could potentially lead
 * to Cell Underflow.
 */
interface CellUnderflowState {
  /** Local Builder variables used to create cells. */
  builders: Map<VariableName, Variable>;
  /** Local Cell variables. */
  cells: Map<VariableName, Variable>;
  /** Local Slice variables. */
  slices: Map<VariableName, Variable>;
  /** Local Message variables. */
  messages: Map<VariableName, Variable>;
  /** Local Struct variables. */
  structs: Map<VariableName, Variable>;
  /**
   * Intermediate variables of any kind.
   * We don't map them as previous variables because we never need them to be
   * processed except a single iteration when we generate warnings.
   */
  intermediateVariables: UnknownVariable[];
}

/**
 * Returns kind of a variable found in the dataflow state.
 */
function hasVariable(
  state: CellUnderflowState,
  name: VariableName,
): VariableKind | null {
  if (state.builders.has(name)) return VariableKind.Builder;
  if (state.cells.has(name)) return VariableKind.Cell;
  if (state.slices.has(name)) return VariableKind.Slice;
  if (state.messages.has(name)) return VariableKind.Message;
  if (state.structs.has(name)) return VariableKind.Struct;
  return null;
}

/**
 * Gets a variable from the state by its name and kind.
 */
function getVariableFromState(
  state: CellUnderflowState,
  name: VariableName,
  kind: VariableKind,
): Variable | undefined {
  switch (kind) {
    case VariableKind.Builder:
      return state.builders.get(name);
    case VariableKind.Cell:
      return state.cells.get(name);
    case VariableKind.Slice:
      return state.slices.get(name);
    case VariableKind.Message:
      return state.messages.get(name);
    case VariableKind.Struct:
      return state.structs.get(name);
    default:
      unreachable(kind);
  }
}

class CellUnderflowLattice implements JoinSemilattice<CellUnderflowState> {
  bottom(): CellUnderflowState {
    return {
      builders: new Map(),
      cells: new Map(),
      slices: new Map(),
      messages: new Map(),
      structs: new Map(),
      intermediateVariables: [],
    };
  }

  join(a: CellUnderflowState, b: CellUnderflowState): CellUnderflowState {
    return {
      builders: mergeMaps(a.builders, b.builders),
      cells: mergeMaps(a.cells, b.cells),
      slices: mergeMaps(a.slices, b.slices),
      messages: mergeMaps(a.messages, b.messages),
      structs: mergeMaps(a.structs, b.structs),
      intermediateVariables: mergeLists(
        a.intermediateVariables,
        b.intermediateVariables,
      ),
    };
  }

  leq(a: CellUnderflowState, b: CellUnderflowState): boolean {
    return (
      isMapSubsetOf(a.builders, b.builders),
      isMapSubsetOf(a.cells, b.cells),
      isMapSubsetOf(a.slices, b.slices),
      isMapSubsetOf(a.messages, b.messages),
      isMapSubsetOf(a.structs, b.structs),
      isListSubsetOf(a.intermediateVariables, b.intermediateVariables)
    );
  }
}

class CellUnderflowTransfer implements Transfer<CellUnderflowState> {
  public transfer(
    inState: CellUnderflowState,
    _node: BasicBlock,
    stmt: AstStatement,
  ): CellUnderflowState {
    const outState = {
      builders: new Map(inState.builders),
      cells: new Map(inState.cells),
      slices: new Map(inState.slices),
      messages: new Map(inState.messages),
      structs: new Map(inState.structs),
      intermediateVariables: [...inState.intermediateVariables],
    };
    this.processStatement(outState, stmt);
    return outState;
  }

  /**
   * Processes the given statement, mutating `outState`.
   */
  private processStatement(
    outState: CellUnderflowState,
    stmt: AstStatement,
  ): void {
    if (stmt.kind === "statement_let") {
      this.addLocalVariable(outState, stmt);
    } else if (stmt.kind === "statement_assign") {
      this.processAssignment(outState, stmt);
    }
    this.processIntermediateCalls(outState, stmt);
  }

  /**
   * Adds new local variables to the output state, if there is anything that
   * could lead to the Cell Underflow problem.
   */
  private addLocalVariable(
    out: CellUnderflowState,
    stmt: AstStatementLet,
  ): void {
    const callsChain = getMethodCallsChain(stmt.expression);
    if (callsChain === undefined) return;
    const { self, calls } = callsChain;
    this.processVariablesFromCalls(out, self, calls, stmt.name);
  }

  /**
   * Process assignments in dataflow updating the local variables present in the
   * dataflow state.
   */
  private processAssignment(
    out: CellUnderflowState,
    stmt: AstStatementAssign,
  ): void {
    if (stmt.path.kind === "id") {
      const varName = idText(stmt.path) as VariableName;
      if (hasVariable(out, varName) !== null) {
        const callsChain = getMethodCallsChain(stmt.expression);
        if (callsChain) {
          const { self, calls } = callsChain;
          this.processVariablesFromCalls(out, self, calls, stmt.path);
        }
      }
    }
  }

  /**
   * Processes variables resulting from method calls and updates the state accordingly.
   *
   * @param out The current state to be updated
   * @param self The receiver of the method calls
   * @param calls Array of method calls to process
   * @param assignmentTarget The target ID where the result will be assigned
   */
  private processVariablesFromCalls(
    out: CellUnderflowState,
    self: AstExpression,
    calls: AstMethodCall[],
    assignmentTarget: AstId,
  ): void {
    const variables = this.processCalls(out, self, calls);

    // Track all intermediate variables except the last one
    variables.slice(0, -1).forEach((variable) => {
      if (variable.kind === "unknown") {
        out.intermediateVariables.push(variable.value);
      }
    });

    // Assign the final variable to the LHS of the assignment/definition.
    if (variables.length > 0) {
      this.createVariable(
        out,
        assignmentTarget,
        variables[variables.length - 1],
      );
    }
  }

  /**
   * A simple interpretation over the list of method calls that tracks
   * intermediate objects in the current dataflow state.
   *
   * @param out The output state
   * @param self The receiver of the processed method calls
   * @param calls The list of method calls
   */
  private processCalls(
    out: CellUnderflowState,
    self: AstExpression,
    calls: AstMethodCall[],
  ): VariableRhs[] {
    const variable = this.processSelf(out, self);
    if (variable) {
      return this.interpretCalls(out, variable, calls);
    }
    return [];
  }

  /**
   * Processes the receiver of method calls to determine if it creates a new
   * variable in the dataflow.
   *
   * @param out The output state containing all the tracked variables
   * @param self The receiver expression to analyze
   * @returns A new variable if the receiver creates/uses one, or null if it's
   *          not interesting for the analysis
   */
  private processSelf(
    out: CellUnderflowState,
    self: AstExpression,
  ): VariableRhs | null {
    // Check for local variables
    if (self.kind === "id") {
      const varName = idText(self) as VariableName;
      const kind = hasVariable(out, varName);
      if (kind) {
        const value = getVariableFromState(out, varName, kind);
        if (!value) {
          throw InternalException.make(`Unknown variable: ${varName}`);
        }
        return {
          kind: "known",
          value,
        };
      }
    }

    // Try to create new variables
    let value: UnknownVariable | null = null;
    if (isStdlibCall("emptyCell", self)) {
      value = {
        kind: VariableKind.Cell,
        calls: new Map(),
      } as UnknownVariable;
    }
    if (isStdlibCall("emptySlice", self)) {
      value = {
        kind: VariableKind.Slice,
        calls: new Map(),
      } as UnknownVariable;
    }
    if (isStdlibCall("beginCell", self)) {
      value = {
        kind: VariableKind.Builder,
        calls: new Map(),
      } as UnknownVariable;
    }
    // TODO Handle initialization of messages and structures
    return value ? { kind: "unknown", value } : null;
  }

  /**
   * Interprets a sequence of method calls on a variable to track state changes.
   * It handles all the type conversions between Builders, Cells, Slices, etc.
   *
   * @param out The output state to update with any new tracked variables
   * @param variable The variable being called on (could be known or unknown)
   * @param calls Array of method calls to interpret
   */
  private interpretCalls(
    out: CellUnderflowState,
    variable: VariableRhs,
    calls: AstMethodCall[],
  ): VariableRhs[] {
    if (calls.length === 0) return [variable];
    const call = calls[0];
    const methodName = idText(call.method);

    // Update calls map for the current variable
    variable.value.calls.set(call.id, call);

    // Transform type if needed
    let newKind = variable.value.kind;
    const typeTransforms: Record<
      string,
      { from: VariableKind[]; to: VariableKind | null }
    > = {
      endCell: { from: [VariableKind.Builder], to: VariableKind.Cell },
      asCell: { from: [VariableKind.Builder], to: VariableKind.Cell },
      asSlice: { from: [VariableKind.Cell], to: VariableKind.Slice },
      beginParse: { from: [VariableKind.Cell], to: VariableKind.Slice },
      toCell: {
        from: [VariableKind.Message, VariableKind.Struct],
        to: VariableKind.Cell,
      },
      toSlice: {
        from: [VariableKind.Message, VariableKind.Struct],
        to: VariableKind.Slice,
      },
      fromCell: { from: [VariableKind.Message, VariableKind.Struct], to: null },
      fromSlice: {
        from: [VariableKind.Message, VariableKind.Struct],
        to: null,
      },
    };

    const transform = typeTransforms[methodName];
    if (transform && transform.from.includes(variable.value.kind)) {
      newKind = transform.to ?? variable.value.kind;
    }

    // Track all variables in the chain
    const variables: VariableRhs[] = [variable];

    // Create new variable if type changed
    if (newKind !== variable.value.kind) {
      const newVariable: VariableRhs = {
        kind: "unknown",
        value: { kind: newKind, calls: new Map() } as UnknownVariable,
      };
      variables.push(newVariable);

      // Process next call with the new variable
      return [
        ...variables,
        ...this.interpretCalls(out, newVariable, calls.slice(1)),
      ];
    }

    // Process next call with the same variable
    return [
      ...variables,
      ...this.interpretCalls(out, variable, calls.slice(1)),
    ];
  }

  /**
   * Defines or reassignes a new variable in the output state.
   *
   * @param out The output state
   * @param lhs Variable at the lhs of the assignment that will be stored in the output state
   * @param variable The rhs of the assignment/definition that will be assigned to the lhs
   * @param kind The kind of the assignee
   */
  private createVariable(
    out: CellUnderflowState,
    lhs: AstId,
    variable: VariableRhs,
  ): void {
    const name = idText(lhs) as VariableName;
    const newVar: Variable = {
      name,
      kind: variable.value.kind,
      loc: lhs.loc,
      calls: variable.value.calls,
    };

    // Update the appropriate map based on variable kind
    switch (variable.value.kind) {
      case VariableKind.Builder:
        out.builders.set(name, newVar);
        break;
      case VariableKind.Cell:
        out.cells.set(name, newVar);
        break;
      case VariableKind.Slice:
        out.slices.set(name, newVar);
        break;
      case VariableKind.Message:
        out.messages.set(name, newVar);
        break;
      case VariableKind.Struct:
        out.structs.set(name, newVar);
        break;
      default:
        unreachable(variable.value.kind);
    }
  }

  /**
   * Adds intermediate variables to the output dataflow state.
   */
  private processIntermediateCalls(
    out: CellUnderflowState,
    stmt: AstStatement,
  ): void {
    forEachExpression(stmt, (expr) => {
      const callsChain = getMethodCallsChain(expr);
      if (callsChain === undefined) return;
      const { self, calls } = callsChain;
      this.processCalls(out, self, calls).forEach((variable) => {
        if (variable.kind === "unknown") {
          out.intermediateVariables.push(variable.value);
        }
      });
    });
  }
}

/**
 * A detector that identifies cell underflow problems.
 *
 * ## Why is it bad?
 * Cell underflow is an issue specific to the TON blockchain. TON stores data in
 * cells, which are low-level data structures used for serialization and deserialization.
 *
 * The underflow issue occurs when the user attempts to get more data from a
 * structure than it supports. cells. When it happens, the contract throws an
 * error with the exit code `9` during the compute phase.
 *
 * ## Example
 * ```tact
 * let s: Slice = beginCell().storeInt(1, 4).asSlice();
 * let data: Int = s.loadInt(5); // Bad: Cell Underflow
 * ```
 *
 * Use instead:
 * ```tact
 * let s: Slice = beginCell().storeInt(1, 4).asSlice();
 * let data: Int = s.loadInt(4); // OK
 * ```
 *
 * ## Resources
 * 1. [Cell & Bag of Cells (BoC) | TON Docs](https://docs.ton.org/develop/data-formats/cell-boc)
 * 2. [TVM Exit codes | TON Docs](https://docs.ton.org/learn/tvm-instructions/tvm-exit-codes)
 * 3. [Cells, Builders and Slices | Tact Docs](https://docs.tact-lang.org/ref/core-cells/)
 */
export class CellUnderflow extends DataflowDetector {
  severity = Severity.CRITICAL;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    let warnings: MistiTactWarning[] = [];
    cu.forEachCFG(
      (cfg: CFG) => {
        const node = cu.ast.getFunction(cfg.id);
        if (node === undefined) {
          return;
        }
        const lattice = new CellUnderflowLattice();
        const transfer = new CellUnderflowTransfer();
        const solver = new WorklistSolver(
          cu,
          cfg,
          transfer,
          lattice,
          "forward",
        );
        const results = solver.solve();
        results.getStates().forEach((state, bbIdx) => {
          const bb = cfg.getBasicBlock(bbIdx);
          if (!bb) throw InternalException.make(`Cannot find BB: #${bbIdx}`);
          const stmt = cu.ast.getStatement(bb.stmtID);
          if (!stmt)
            throw InternalException.make(
              `Cannot find statement: #${bb.stmtID}`,
            );
          // Check intermediate variables
          const intermediateVariableWarnings =
            state.intermediateVariables.reduce(
              (acc, variable) =>
                acc.concat(this.checkIntermediateVariable(variable, stmt.loc)),
              [] as MistiTactWarning[],
            );

          // Check known variables for each type
          const knownVariableWarnings = [
            ...this.checkKnownVariables(state.builders),
            ...this.checkKnownVariables(state.cells),
            ...this.checkKnownVariables(state.slices),
            ...this.checkKnownVariables(state.messages),
            ...this.checkKnownVariables(state.structs),
          ];

          warnings = warnings.concat([
            ...intermediateVariableWarnings,
            ...knownVariableWarnings,
          ]);
        });
      },
      { includeStdlib: false },
    );
    return warnings;
  }

  /**
   * Checks for cell underflows in the intermedite variable.
   */
  private checkIntermediateVariable(
    _variable: UnknownVariable,
    _loc: SrcInfo,
  ): MistiTactWarning[] {
    throw new Error("NYI"); // TODO
  }

  /**
   * Checks for cell underflows in known variables of any kind.
   */
  private checkKnownVariables(
    _variables: Map<VariableName, Variable>,
  ): MistiTactWarning[] {
    throw new Error("NYI"); // TODO
  }
}
