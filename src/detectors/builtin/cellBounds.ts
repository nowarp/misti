import { InternalException } from "../../internals/exceptions";
import { BasicBlock, CFG, CompilationUnit } from "../../internals/ir";
import { JoinSemilattice } from "../../internals/lattice";
import { Interval, Num } from "../../internals/numbers";
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

const undecidableStorageValue = (): StorageValue => {
  return {
    undecidable: true,
    stored: Interval.EMPTY,
    loaded: Interval.EMPTY,
  };
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

const undecidableVariableStorage = (): VariableStorage => {
  return {
    refsNum: undecidableStorageValue(),
    dataSize: undecidableStorageValue(),
  };
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
 * The point of definition hasn't been processed or we have an intermediate variable.
 */
type UnknownVariable = Omit<Variable, "name" | "loc">;

/**
 * Variable expression appearing in the rhs of the variable definition or assignment.
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
      isMapSubsetOf(a.builders, b.builders) &&
      isMapSubsetOf(a.cells, b.cells) &&
      isMapSubsetOf(a.slices, b.slices) &&
      isMapSubsetOf(a.messages, b.messages) &&
      isMapSubsetOf(a.structs, b.structs) &&
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
    const copyVarMap = <K>(map: Map<K, Variable>): Map<K, Variable> =>
      new Map(
        Array.from(map).map(([k, v]) => [
          k,
          { ...v, storage: deepCopyVariableStorage(v.storage) },
        ]),
      );

    // Create deep copy of state
    const out = {
      builders: copyVarMap(inState.builders),
      cells: copyVarMap(inState.cells),
      slices: copyVarMap(inState.slices),
      messages: copyVarMap(inState.messages),
      structs: copyVarMap(inState.structs),
      // We don't copy intermediate variables since these are limited to a
      // single statement.
      intermediateVariables: [],
    };

    this.processStatement(out, stmt);
    return out;
  }

  /**
   * Processes the given statement, mutating `outState`.
   */
  private processStatement(out: CellUnderflowState, stmt: AstStatement): void {
    if (stmt.kind === "statement_let") {
      this.processLet(out, stmt);
    } else if (stmt.kind === "statement_assign") {
      this.processAssignment(out, stmt);
    } else {
      this.processIntermediateCalls(out, stmt);
    }
  }

  /**
   * Adds new local variables to the output state, if there is anything that
   * could lead to the Cell Underflow problem.
   */
  private processLet(out: CellUnderflowState, stmt: AstStatementLet): void {
    const callsChain = getMethodCallsChain(stmt.expression);
    if (callsChain === undefined) {
      // Try to create variable from the single expression.
      // It might be a function call, e.g. beginCell(), emptySlice()
      const variable = this.processSelf(out, stmt.expression);
      if (variable) {
        this.createVariable(out, stmt.name, variable);
      }
      return;
    }
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
    const variable = this.processSelf(out, self);
    if (variable) {
      const result = this.interpretCalls(out, variable, calls);

      // Apply the accumulated storage updates to the variable
      result.variable.value.storage = this.combineStorageUpdates(
        result.variable.value.storage,
        result.storageUpdates,
      );

      // Assign the final variable to the LHS of the assignment/definition.
      this.createVariable(out, assignmentTarget, result.variable);
    }
  }

  /**
   * A simple interpretation over the list of method calls that tracks
   * intermediate objects in the current dataflow state.
   *
   * @param out The output state
   * @param self The variable being called on (could be known or unknown)
   * @param calls The list of method calls
   */
  private interpretCalls(
    out: CellUnderflowState,
    variable: VariableRhs,
    calls: AstMethodCall[],
  ): {
    variable: VariableRhs;
    storageUpdates: VariableStorage;
    intermediates: VariableRhs[];
  } {
    let intermediates: VariableRhs[] = [];
    if (calls.length === 0) {
      return {
        variable,
        storageUpdates: createEmptyVariableStorage(),
        intermediates,
      };
    }

    const call = calls[0];
    const methodName = idText(call.method);

    // Get the storage updates from updateStorage without mutating the variable
    const storageUpdate = this.updateStorage(out, variable, call);

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

    // Create new variable if type changed
    if (newKind !== variable.value.kind) {
      const newVariable: VariableRhs = {
        kind: "unknown",
        value: {
          kind: newKind,
          storage: variable.value.storage, // Storage will be updated later
        } as UnknownVariable,
      };

      // Collect the intermediate variable
      intermediates.push(newVariable);

      // Recursively process the remaining calls
      const result = this.interpretCalls(out, newVariable, calls.slice(1));

      // Combine storage updates
      const combinedStorageUpdates = this.combineStorageUpdates(
        storageUpdate,
        result.storageUpdates,
      );

      // Combine intermediates
      intermediates = intermediates.concat(result.intermediates);

      return {
        variable: result.variable,
        storageUpdates: combinedStorageUpdates,
        intermediates,
      };
    }

    // If type didn't change, proceed with the same variable
    const result = this.interpretCalls(out, variable, calls.slice(1));

    // Combine storage updates
    const combinedStorageUpdates = this.combineStorageUpdates(
      storageUpdate,
      result.storageUpdates,
    );

    // Combine intermediates
    intermediates = intermediates.concat(result.intermediates);

    return {
      variable: result.variable,
      storageUpdates: combinedStorageUpdates,
      intermediates,
    };
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
          refsNum: createEmptyStorageValue(),
          dataSize: createEmptyStorageValue(),
        },
      } as UnknownVariable;
    }
    if (isStdlibCall("emptySlice", self)) {
      value = {
        kind: VariableKind.Slice,
        storage: {
          refsNum: createEmptyStorageValue(),
          dataSize: createEmptyStorageValue(),
        },
      };
    }
    if (isStdlibCall("beginCell", self)) {
      value = {
        kind: VariableKind.Builder,
        storage: {
          refsNum: createEmptyStorageValue(),
          dataSize: createEmptyStorageValue(),
        },
      };
    }

    // TODO Handle initialization of messages and structures
    return value ? { kind: "unknown", value } : null;
  }

  /**
   * Interprets the current method call updating the `variable.storage` if needed.
   */
  private updateStorage(
    out: CellUnderflowState,
    variable: VariableRhs,
    call: AstMethodCall,
  ): VariableStorage {
    const storageUpdate = createEmptyVariableStorage();

    const storedRefs = this.getStoredRefs(variable, call);
    if (storedRefs !== undefined) {
      storageUpdate.refsNum.stored = storedRefs;
    }

    const loadedRefs = this.getLoadedRefs(variable, call);
    if (loadedRefs !== undefined) {
      storageUpdate.refsNum.loaded = loadedRefs;
    }

    const storeSize = this.getStoreSize(variable, call);
    if (storeSize !== undefined) {
      storageUpdate.dataSize.stored = storeSize;
    }

    const loadSize = this.getLoadSize(variable, call);
    if (loadSize !== undefined) {
      storageUpdate.dataSize.loaded = loadSize;
    }

    const localVariablesSize = this.getLocalVariablesSize(out, variable, call);
    if (localVariablesSize !== undefined) {
      // Combine with existing storage updates
      storageUpdate.dataSize = this.combineStorageValues(
        storageUpdate.dataSize,
        localVariablesSize.dataSize,
      );
      storageUpdate.refsNum = this.combineStorageValues(
        storageUpdate.refsNum,
        localVariablesSize.refsNum,
      );
    }

    // Return the storage updates without mutating the variable
    return storageUpdate;
  }

  /**
   * Returns the number of references possible stored by the method call.
   *
   * @returns The interval of possible number of references or undefined if it
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
   * @returns The interval of possible number of references or undefined if it
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
   *
   * @returns The interval of possible stored value or undefined if there are no store calls.
   */
  private getStoreSize(
    variable: VariableRhs,
    call: AstMethodCall,
  ): Interval | undefined {
    if (variable.value.kind !== VariableKind.Builder) {
      return undefined;
    }

    // Try to extract constant store size
    const size = getConstantStoreSize(call);
    if (size !== undefined) {
      return Interval.fromNum(size);
    }

    return undefined;
  }

  /**
   * Returns the storage cost in bits for load operations.
   *
   * @returns The interval of possible loaded value or undefined if there are no load calls.
   */
  private getLoadSize(
    variable: VariableRhs,
    call: AstMethodCall,
  ): Interval | undefined {
    if (variable.value.kind !== VariableKind.Slice) {
      return undefined;
    }
    // Try to extract constant load size
    const size = getConstantLoadSize(call);
    if (size !== undefined) {
      return Interval.fromNum(size);
    }
    // TODO Support preload operations
    return undefined;
  }

  /**
   * Updates storage tracking when builders/slices are stored into other builders.
   *
   * @param out Current dataflow state containing tracked variables
   * @param variable Variable being modified (the builder storing data)
   * @param call The storeBuilder/storeSlice method call
   * @returns Updated storage state after combining variables, or undefined if not a store operation.
   *          Returns undecidable storage if the stored variable can't be tracked.
   */
  private getLocalVariablesSize(
    out: CellUnderflowState,
    variable: VariableRhs,
    call: AstMethodCall,
  ): VariableStorage | undefined {
    if (["storeBuilder", "storeSlice"].includes(idText(call.method))) {
      // Try to find a stored builder in the dataflow state.
      const arg = call.args[0];
      if (arg.kind === "id") {
        const builderName = idText(arg) as VariableName;
        const builder = out.builders.get(builderName);
        if (builder) {
          const varStorage = createEmptyVariableStorage();
          varStorage.dataSize = deepCopyStorage(
            variable.value.storage.dataSize,
          );
          varStorage.refsNum = deepCopyStorage(variable.value.storage.refsNum);

          varStorage.dataSize.stored = varStorage.dataSize.stored.plus(
            builder.storage.dataSize.stored,
          );
          varStorage.refsNum.stored = varStorage.refsNum.stored.plus(
            builder.storage.refsNum.stored,
          );

          return varStorage;
        }
      }
      // Unknown Builder/Slice => size is statically undecidable
      return undecidableVariableStorage();
    }

    // The call doesn't involve any operations with local variables.
    return undefined;
  }

  /**
   * Defines or reassigns a new variable in the output state.
   *
   * @param out The output state
   * @param lhs Variable at the lhs of the assignment that will be stored in the output state
   * @param variable The rhs of the assignment/definition that will be assigned to the lhs
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
    const processedCalls = new Set<AstNode["id"]>();
    forEachExpression(stmt, (expr) => {
      const callsChain = getMethodCallsChain(expr);
      if (callsChain === undefined) return;

      // Check if these calls were previously processed
      let hasUnvisited = false;
      callsChain.calls.forEach((c) => {
        if (!processedCalls.has(c.id)) {
          hasUnvisited = true;
        }
      });
      if (!hasUnvisited) return;

      const { self, calls } = callsChain;
      const variable = this.processSelf(out, self);
      if (!variable) return;

      const result = this.interpretCalls(out, variable, calls);

      // Do NOT apply the accumulated storage updates to the variable here
      // Since the method calls are not assigned, we should not update the variable's storage

      // Collect intermediate variables
      result.intermediates.forEach((intermediateVar) => {
        if (intermediateVar.kind === "unknown") {
          out.intermediateVariables.push(intermediateVar.value);
        }
      });

      // Also add the final variable if it's unknown
      if (result.variable.kind === "unknown") {
        out.intermediateVariables.push(result.variable.value);
      }
    });
  }

  /**
   * Combines two StorageValue instances.
   */
  private combineStorageValues(a: StorageValue, b: StorageValue): StorageValue {
    return {
      undecidable: a.undecidable || b.undecidable,
      stored: a.stored.plus(b.stored),
      loaded: a.loaded.plus(b.loaded),
    };
  }

  /**
   * Combines two VariableStorage instances.
   */
  private combineStorageUpdates(
    a: VariableStorage,
    b: VariableStorage,
  ): VariableStorage {
    return {
      refsNum: this.combineStorageValues(a.refsNum, b.refsNum),
      dataSize: this.combineStorageValues(a.dataSize, b.dataSize),
    };
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
 * A detector that identifies cell overflow and underflow problems.
 *
 * ## Why is it bad?
 * Cell overflow and underflow are issues specific to the TON blockchain. TON
 * stores data in cells, which are low-level data structures used for serialization
 * and deserialization.
 *
 * The overflow issue occurs when the user attempts to store more data in a cell
 * than it supports. The current limitation is 1023 bits and 4 references to other
 * cells. When these limits are exceeded, the contract throws an error with the
 * exit code `8` during the compute phase.
 *
 * The underflow issue occurs when the user attempts to get more data from a
 * structure than it supports. cells. When it happens, the contract throws an
 * error with the exit code `9` during the compute phase.
 *
 * ## Example
 * ```tact
 * // Bad: storeRef is used more than 4 times
 * beginCell()
 *   .storeRef(...)
 *   .storeAddress(myAddress())
 *   .storeRef(...)
 *   .storeRef(...)
 *   .storeRef(...)
 *   .storeRef(...)
 *   .endCell()
 * ```
 *
 * Use instead:
 * ```tact
 * // OK: Fixed after the analyzer highlighted it
 * beginCell()
 *   .storeRef(...)
 *   .storeAddress(myAddress())
 *   .storeRef(...)
 *   .storeRef(...)
 *   .storeRef(...)
 *   .endCell()
 * ```
 *
 * ## Resources
 * 1. [Cell & Bag of Cells (BoC) | TON Docs](https://docs.ton.org/develop/data-formats/cell-boc)
 * 2. [TVM Exit codes | TON Docs](https://docs.ton.org/learn/tvm-instructions/tvm-exit-codes)
 * 3. [Cells, Builders and Slices | Tact Docs](https://docs.tact-lang.org/ref/core-cells/)
 */
export class CellBounds extends DataflowDetector {
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
      const [title, extraDescription, suggestion] = [
        "Reference count might go below 0",
        `The possible number of references stored (${refsNum.stored}) ` +
          `is less than loaded (${refsNum.loaded})`,
        "Remove extra .loadRef operations or store more refs first",
      ];
      warnings.push(
        this.makeWarning(title, loc, {
          extraDescription,
          suggestion,
        }),
      );
    }

    // Check for too many refs (overflow)
    if (!refsNum.undecidable && Num.gt(refsNum.stored.low, Num.int(4))) {
      const [title, extraDescription, suggestion] = [
        "Too many references stored in cell",
        `The minimum number of references stored (${refsNum.stored.low}) ` +
          `exceeds the maximum allowed (4)`,
        "Split your data across multiple cells - a single cell cannot store more than 4 references",
      ];
      warnings.push(
        this.makeWarning(title, loc, {
          extraDescription,
          suggestion,
        }),
      );
    }

    // Check if we might load more data than we stored
    const netData = dataSize.stored.minus(dataSize.loaded);
    if (!dataSize.undecidable && Num.lt(netData.high, Num.int(0))) {
      const [title, extraDescription, suggestion] = [
        "Data size might go below 0",
        `The possible data size stored (${dataSize.stored}) ` +
          `is less than loaded (${dataSize.loaded})`,
        "Remove extra .load operations or store more data first",
      ];
      warnings.push(
        this.makeWarning(title, loc, {
          extraDescription,
          suggestion,
        }),
      );
    }

    // Check for data size overflow
    if (!dataSize.undecidable && Num.gt(dataSize.stored.low, Num.int(1023))) {
      const [title, extraDescription, suggestion] = [
        "Data size exceeds cell capacity",
        `The minimum data size stored (${dataSize.stored.low} bits) ` +
          `exceeds the maximum allowed (1023 bits)`,
        "Split your data across multiple cells - a single cell cannot store more than 1023 bits",
      ];
      warnings.push(
        this.makeWarning(title, loc, {
          extraDescription,
          suggestion,
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

function createEmptyStorageValue(): StorageValue {
  return {
    undecidable: false,
    stored: Interval.fromNum(0),
    loaded: Interval.fromNum(0),
  };
}

function createEmptyVariableStorage(): VariableStorage {
  return {
    refsNum: createEmptyStorageValue(),
    dataSize: createEmptyStorageValue(),
  };
}
