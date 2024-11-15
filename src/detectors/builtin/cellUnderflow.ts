import { InternalException } from "../../internals/exceptions";
import { BasicBlock, CFG, CompilationUnit } from "../../internals/ir";
import { JoinSemilattice } from "../../internals/lattice";
import { WorklistSolver } from "../../internals/solver/";
import {
  getConstantStoreSize,
  getConstantLoadSize,
  getMethodCallsChain,
  isStdlibCall,
} from "../../internals/tact/";
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
  AstNode,
} from "@tact-lang/compiler/dist/grammar/ast";
import { Interval, Num } from "../../internals/numbers";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";

type VariableName = string & { readonly __brand: unique symbol };
enum VariableKind {
  Builder = "builder",
  Cell = "cell",
  Slice = "slice",
  Message = "message",
  Struct = "struct",
}

type StorageValue = {
  /**
   * It is not possible to reason about this value using static analysis.
   */
  undecidable: boolean;
  /**
   * A possible number of refs stored with `.storeRef()` calls.
   */
  stored: Interval;
  /**
   * A possible number of refs loaded with `.loadRef()` calls.
   */
  loaded: Interval;
};

/**
 * Tracks data stored by this variable.
 * It includes only statically decidable information. Storage operations with
 * unknown size won't increase these counters.
 */
type VariableStorage = {
  /**
   * Possible number of references stored or loaded for this variable.
   */
  refsNum: StorageValue;
  /**
   * Possible number of data bits stored or loaded for this variable.
   */
  dataSize: StorageValue;
};

/**
 * Variable which has a point of definition.
 */
type Variable = {
  name: VariableName;
  loc: SrcInfo;
  kind: VariableKind;
  storage: VariableStorage;
};

/**
 * The point of definition hasn't been processed or we have an intermedite variable.
 */
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
      this.processLet(outState, stmt);
    } else if (stmt.kind === "statement_assign") {
      this.processAssignment(outState, stmt);
    } else {
      this.processIntermediateCalls(outState, stmt);
    }
  }

  /**
   * Adds new local variables to the output state, if there is anything that
   * could lead to the Cell Underflow problem.
   */
  private processLet(
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
      const interpreted = this.interpretCalls(out, variable, calls);
      return interpreted.length === 0 ? [variable] : interpreted;
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
        storage: {
          refsNum: {
            undecidable: false,
            stored: Interval.fromNum(0),
            loaded: Interval.fromNum(0),
          },
          dataSize: {
            undecidable: false,
            stored: Interval.fromNum(0),
            loaded: Interval.fromNum(0),
          },
        },
      } as UnknownVariable;
    }
    if (isStdlibCall("emptySlice", self)) {
      value = {
        kind: VariableKind.Slice,
        storage: {
          refsNum: {
            undecidable: false,
            stored: Interval.fromNum(0),
            loaded: Interval.fromNum(0),
          },
          dataSize: {
            undecidable: false,
            stored: Interval.fromNum(0),
            loaded: Interval.fromNum(0),
          },
        },
      };
    }
    if (isStdlibCall("beginCell", self)) {
      value = {
        kind: VariableKind.Builder,
        storage: {
          refsNum: {
            undecidable: false,
            stored: Interval.fromNum(0),
            loaded: Interval.fromNum(0),
          },
          dataSize: {
            undecidable: false,
            stored: Interval.fromNum(0),
            loaded: Interval.fromNum(0),
          },
        },
      };
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
    if (calls.length === 0) return [];
    const call = calls[0];
    const methodName = idText(call.method);

    // Update storage size for the current variable
    this.updateStorage(out, variable, call);

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
        value: {
          kind: newKind,
          storage: deepCopyVariableStorage(variable.value.storage),
        } as UnknownVariable,
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
   * Interprets the current method call updating the `variable.storage` if needed.
   */
  private updateStorage(
    out: CellUnderflowState,
    variable: VariableRhs,
    call: AstMethodCall,
  ): void {
    const storedRefs = this.getStoredRefs(variable, call);
    if (storedRefs !== undefined) {
      variable.value.storage.refsNum.stored =
        variable.value.storage.refsNum.stored.plus(storedRefs);
      return;
    }
    const loadedRefs = this.getLoadedRefs(variable, call);
    if (loadedRefs !== undefined) {
      variable.value.storage.refsNum.loaded =
        variable.value.storage.refsNum.loaded.plus(loadedRefs);
      return;
    }
    const storeSize = this.getStoreSize(out, call);
    if (storeSize !== undefined) {
      variable.value.storage.dataSize.stored =
        variable.value.storage.dataSize.stored.plus(storeSize);
      return;
    }
    const loadSize = this.getLoadSize(out, call);
    if (loadSize !== undefined) {
      variable.value.storage.dataSize.loaded =
        variable.value.storage.dataSize.loaded.plus(loadSize);
      return;
    }
  }

  /**
   * Returns the number of references possible stored by the method call.
   *
   * @returns The interval of possible number of references of undefined if it
   *          doesn't store references.
   */
  private getStoredRefs(
    variable: VariableRhs,
    call: AstMethodCall,
  ): Interval | undefined {
    if (
      variable.value.kind === VariableKind.Builder &&
      isStdlibCall("storeRef", call)
    ) {
      return Interval.fromNum(1);
    }
    if (
      variable.value.kind === VariableKind.Builder &&
      isStdlibCall("storeMaybeRef", call)
    ) {
      return Interval.fromNums(0, 1);
    }
    return undefined;
  }

  /**
   * Returns the number of references possible loaded by the method call.
   *
   * @returns The interval of possible number of references of undefined if it
   *          doesn't load references.
   */
  private getLoadedRefs(
    variable: VariableRhs,
    call: AstMethodCall,
  ): Interval | undefined {
    if (
      variable.value.kind === VariableKind.Slice &&
      isStdlibCall("loadRef", call)
    ) {
      return Interval.fromNum(1);
    }
    return undefined;
  }

  /**
   * Returns the storage cost in bits for store operations.
   * https://github.com/tact-lang/tact/blob/2315d035f5f9a22cad42657561c1a0eaef997b05/stdlib/std/cells.tact
   *
   * @returns The interval of possible stored value or undefined if there are no store calls.
   */
  private getStoreSize(
    out: CellUnderflowState,
    call: AstMethodCall,
    visited: Set<VariableName> = new Set(),
  ): Interval | undefined {
    // TODO: check kind of variable
    // Try to extract constant store size
    const size = getConstantStoreSize(call);
    if (size !== undefined) {
      return Interval.fromNum(size);
    }
    // TODO: use local variables from `out`
    // TODO return Interval.EMPTY if `store` call but the size is undecidable
    return undefined;
  }

  /**
   * Returns the storage cost in bits for load operations.
   * https://github.com/tact-lang/tact/blob/2315d035f5f9a22cad42657561c1a0eaef997b05/stdlib/std/cells.tact
   *
   * @returns The interval of possible loaded value or undefined if there are no load calls.
   */
  private getLoadSize(
    out: CellUnderflowState,
    call: AstMethodCall,
    visited: Set<VariableName> = new Set(),
  ): Interval | undefined {
    // TODO: check kind of variable
    // Try to extract constant store size
    const size = getConstantLoadSize(call);
    if (size !== undefined) {
      return Interval.fromNum(size);
    }
    // TODO Support preload operations
    // TODO: use local variables from `out`
    // TODO return Interval.EMPTY if `load` call but the size is undecidable
    return undefined;
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
      storage: deepCopyVariableStorage(variable.value.storage),
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
    const visited: Set<AstNode["id"]> = new Set();
    forEachExpression(stmt, (expr) => {
      const callsChain = getMethodCallsChain(expr);
      if (callsChain === undefined) return;

      // Check if these calls were previously processed
      let hasUnvisited = false;
      callsChain.calls.forEach((c) => {
        if (visited.has(c.id)) {
          hasUnvisited = true;
        }
        visited.add(c.id);
      });
      if (!hasUnvisited) return;

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
 * Deep copies a StorageValue object
 */
function deepCopyStorage(storage: StorageValue): StorageValue {
  return {
    undecidable: storage.undecidable,
    stored: storage.stored.clone(),
    loaded: storage.loaded.clone(),
  };
}

/**
 * Deep copies VariableStorage
 */
function deepCopyVariableStorage(storage: VariableStorage): VariableStorage {
  return {
    refsNum: deepCopyStorage(storage.refsNum),
    dataSize: deepCopyStorage(storage.dataSize),
  };
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

          // Check known variables of each type
          const knownVariableWarnings = [
            ...Array.from(state.builders.values()).flatMap((v) =>
              this.checkKnownVariable(v),
            ),
            ...Array.from(state.cells.values()).flatMap((v) =>
              this.checkKnownVariable(v),
            ),
            ...Array.from(state.slices.values()).flatMap((v) =>
              this.checkKnownVariable(v),
            ),
            ...Array.from(state.messages.values()).flatMap((v) =>
              this.checkKnownVariable(v),
            ),
            ...Array.from(state.structs.values()).flatMap((v) =>
              this.checkKnownVariable(v),
            ),
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
   * Checks any variable type for potential cell underflow issues.
   *
   * The checker always overapproximates in order to avoid false positives.
   *
   * @param variable The variable to check (known or unknown)
   * @param loc Source location for error reporting
   */
  private checkVariable(
    variable: UnknownVariable | Variable,
    loc: SrcInfo,
  ): MistiTactWarning[] {
    const warnings: MistiTactWarning[] = [];
    const { refsNum, dataSize } = variable.storage;

    // Check if we might load more refs than we stored
    const netRefs = refsNum.stored.minus(refsNum.loaded);
    if (!refsNum.undecidable && Num.lt(netRefs.high, Num.int(0))) {
      warnings.push(
        this.makeWarning(`Reference count might go below 0`, loc, {
          extraDescription: `The possible number of references stored (${refsNum.stored.toString()}) is less than loaded (${refsNum.loaded.toString()})`,
          suggestion:
            "Remove extra .loadRef operations or store more refs first",
        }),
      );
    }

    // Check if we might load more data than we stored
    const netData = dataSize.stored.minus(dataSize.loaded);
    if (!dataSize.undecidable && Num.lt(netData.high, Num.int(0))) {
      warnings.push(
        this.makeWarning(`Data size might go below 0`, loc, {
          extraDescription: `The possible data size stored (${dataSize.stored.toString()}) is less than loaded (${dataSize.loaded.toString()})`,
          suggestion: "Remove extra .load operations or store more data first",
        }),
      );
    }

    return warnings;
  }

  /**
   * Checks any variable type for potential cell underflow issues.
   *
   * @param variable The variable to check (known or unknown)
   * @param loc Source location for error reporting
   */
  private checkIntermediateVariable(
    variable: UnknownVariable,
    loc: SrcInfo,
  ): MistiTactWarning[] {
    return this.checkVariable(variable, loc);
  }

  /**
   * Checks any variable type for potential cell underflow issues.
   *
   * @param variable The variable to check (known or unknown)
   * @param loc Source location for error reporting
   */
  private checkKnownVariable(variable: Variable): MistiTactWarning[] {
    return this.checkVariable(variable, variable.loc);
  }
}
