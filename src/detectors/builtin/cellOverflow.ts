import { InternalException } from "../../internals/exceptions";
import { BasicBlock, CFG, CompilationUnit } from "../../internals/ir";
import { JoinSemilattice } from "../../internals/lattice";
import { WorklistSolver } from "../../internals/solver/";
import { isStdlibCall, getConstantStoreSize } from "../../internals/tact/";
import { forEachExpression } from "../../internals/tact/iterators";
import { Transfer } from "../../internals/transfer";
import {
  mergeLists,
  isListSubsetOf,
  mergeMaps,
  isMapSubsetOf,
} from "../../internals/util";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { DataflowDetector } from "../detector";
import {
  AstStatement,
  AstStatementLet,
  AstNode,
  AstId,
  AstExpression,
  SrcInfo,
  idText,
  AstMethodCall,
  AstStatementAssign,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * The storage used by the store operation or the presence of the reference is
 * statically unknown.
 */
const UNDECIDABLE = 0n;

type BuilderName = string;
type MethodAstId = AstMethodCall["id"];

/** Temporary cell objects: `beginCell().<ops>.endCell()` */
type TempCell = {
  // Position of `beginCell()`
  loc: SrcInfo;
  // Method calls other than `beginCell`.
  // Includes `endCell` for consistency.
  calls: Map<MethodAstId, AstMethodCall>;
};

interface CellOverflowState {
  // Temporary cell objects created using `beginCell().<ops>.endCell()`
  tempCells: TempCell[];
  // Local variables of the Builder type and information on methods calls used over them
  localBuilders: Map<
    BuilderName,
    { def: SrcInfo; calls: Map<MethodAstId, AstMethodCall> }
  >;
}

/**
 * Adds a new variable to `localBuilders`.
 */
function addLocalBuilder(
  state: CellOverflowState,
  id: AstId,
  calls: Map<MethodAstId, AstMethodCall> = new Map(),
): void {
  state.localBuilders.set(idText(id), { def: id.loc, calls });
}

/**
 * Initializes or appends method calls to an existing variable in `localBuilders`.
 */
function addCalls(
  state: CellOverflowState,
  name: BuilderName,
  calls: Map<MethodAstId, AstMethodCall>,
): void | never {
  if (calls.size === 0) {
    return;
  }
  const builder = state.localBuilders.get(name);
  if (builder) {
    if (!hasEndCell(builder.calls)) {
      const filterCallsBeforeEndCell = (
        calls: Map<MethodAstId, AstMethodCall>,
      ) => {
        const endCellIndex = Array.from(calls.values()).findIndex((call) =>
          hasEndCell(new Map([[call.method.id, call]])),
        );
        return endCellIndex === -1
          ? calls
          : new Map(Array.from(calls.entries()).slice(0, endCellIndex + 1));
      };
      builder.calls = new Map([
        ...builder.calls,
        ...filterCallsBeforeEndCell(calls),
      ]);
    }
  } else {
    throw InternalException.make(`Builder variable ${name} does not exist`);
  }
}

function hasEndCell(calls: Map<MethodAstId, AstMethodCall>): boolean {
  const lastCall = Array.from(calls.values()).pop();
  return lastCall !== undefined && idText(lastCall.method) === "endCell";
}

/**
 * A powerset lattice that keeps taint state in dataflow.
 */
class CellOverflowLattice implements JoinSemilattice<CellOverflowState> {
  bottom(): CellOverflowState {
    return {
      tempCells: [],
      localBuilders: new Map(),
    };
  }

  join(a: CellOverflowState, b: CellOverflowState): CellOverflowState {
    const tempCells = mergeLists(a.tempCells, b.tempCells);
    const localBuilders = mergeMaps(a.localBuilders, b.localBuilders);
    return {
      tempCells,
      localBuilders,
    };
  }

  leq(a: CellOverflowState, b: CellOverflowState): boolean {
    return (
      isListSubsetOf(a.tempCells, b.tempCells) &&
      isMapSubsetOf(a.localBuilders, b.localBuilders)
    );
  }
}

class CellOverflowTransfer implements Transfer<CellOverflowState> {
  public transfer(
    inState: CellOverflowState,
    _node: BasicBlock,
    stmt: AstStatement,
  ): CellOverflowState {
    const outState = {
      tempCells: [...inState.tempCells],
      localBuilders: new Map(inState.localBuilders),
    };
    this.processStatement(outState, stmt);
    return outState;
  }

  /**
   * Processes the given statement, mutating `outState`.
   */
  private processStatement(
    outState: CellOverflowState,
    stmt: AstStatement,
  ): void {
    if (stmt.kind === "statement_let") {
      this.addLocalBuilder(outState, stmt);
    } else if (stmt.kind === "statement_assign") {
      this.processAssignment(outState, stmt);
    }
    this.processIntermediateBuilders(outState, stmt);
  }

  /**
   * Adds new local builder variables to the output state, if any.
   */
  private addLocalBuilder(
    outState: CellOverflowState,
    stmt: AstStatementLet,
  ): void {
    const result = this.getMethodCallsChain(stmt.expression);
    if (result === undefined) return;
    const { firstReceiver, calls } = result;
    // Builder initialization starts with `beginCell()`.
    // If it ends with `endCell()`, it will be processed in processStoreCalls as
    // a temporary Cell object.
    if (isStdlibCall("beginCell", firstReceiver) && !hasEndCell(calls)) {
      addLocalBuilder(outState, stmt.name);
      addCalls(outState, idText(stmt.name), calls);
    }
  }

  /**
   * Processes the .store operations on the previously added local variables
   * with `Builder` type or intermediate Cell objects (beginCell().<ops>.endCell())
   */
  private processIntermediateBuilders(
    outState: CellOverflowState,
    node: AstNode,
  ): void {
    forEachExpression(node, (expr) => {
      const result = this.getMethodCallsChain(expr);
      if (result !== undefined) {
        const { firstReceiver, calls } = result;
        if (this.isTempCell(firstReceiver, calls)) {
          // A cell is created using beginCell().<ops>.endCell().
          // We need to check for any overflows within <ops>.
          outState.tempCells.push({
            loc: firstReceiver.loc,
            calls,
          } as TempCell);
        }
      }
    });
  }

  /**
   * Collects a chain of method calls present in the following format:
   * expr.method1().method2()
   */
  private getMethodCallsChain(
    expr: AstExpression,
  ):
    | { firstReceiver: AstExpression; calls: Map<MethodAstId, AstMethodCall> }
    | undefined {
    const calls = new Map<MethodAstId, AstMethodCall>();
    let currentExpr: AstExpression = expr;
    while (currentExpr.kind === "method_call") {
      const methodCall = currentExpr as AstMethodCall;
      calls.set(methodCall.method.id, methodCall);
      currentExpr = methodCall.self;
    }
    if (currentExpr.kind === "static_call" || calls.size > 0) {
      return { firstReceiver: currentExpr, calls };
    }
    return undefined;
  }

  /**
   * Detects whether the cell object is created in-place using the
   * `beginCell().<ops>.endCell()` construction.
   */
  private isTempCell(
    firstReceiver: AstExpression,
    calls: Map<MethodAstId, AstMethodCall>,
  ): boolean {
    return isStdlibCall("beginCell", firstReceiver) && hasEndCell(calls);
  }

  /**
   * Returns the name of the first receiver if it's a previously added local Builder variable.
   */
  private getKnownBuilderName(
    outState: CellOverflowState,
    firstReceiver: AstExpression,
  ): string | undefined {
    return firstReceiver.kind === "id" &&
      outState.localBuilders.has(idText(firstReceiver))
      ? idText(firstReceiver)
      : undefined;
  }

  private processAssignment(
    outState: CellOverflowState,
    stmt: AstStatementAssign,
  ): void {
    if (stmt.path.kind === "id") {
      const builderName = idText(stmt.path);
      if (outState.localBuilders.has(builderName)) {
        const result = this.getMethodCallsChain(stmt.expression);
        if (result) {
          const { firstReceiver, calls } = result;
          if (
            this.getKnownBuilderName(outState, firstReceiver) === builderName
          ) {
            addCalls(outState, builderName, calls);
          }
        }
      }
    }
  }
}

/**
 * A detector that identifies cell overflow problems.
 *
 * ## Why is it bad?
 * Cell overflow is an issue specific to the TON blockchain. TON stores data in
 * cells, which are low-level data structures used for serialization and deserialization.
 *
 * The overflow issue occurs when the user attempts to store more data in a cell
 * than it supports. The current limitation is 1023 bits and 4 references to other
 * cells. When these limits are exceeded, the contract throws an error with the
 * exit code `8` during the compute phase.
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
export class CellOverflow extends DataflowDetector {
  severity = Severity.CRITICAL;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    let warnings: MistiTactWarning[] = [];
    cu.forEachCFG(
      (cfg: CFG) => {
        const node = cu.ast.getFunction(cfg.id);
        if (node === undefined) {
          return;
        }
        const lattice = new CellOverflowLattice();
        const transfer = new CellOverflowTransfer();
        const solver = new WorklistSolver(
          cu,
          cfg,
          transfer,
          lattice,
          "forward",
        );
        const results = solver.solve();
        results.getStates().forEach((state, _nodeIdx) => {
          const tempCellWarnings = state.tempCells.reduce(
            (acc, cell) =>
              acc.concat(
                this.checkOverflows(cell.loc, cell.calls, state.localBuilders),
              ),
            [] as MistiTactWarning[],
          );
          const builderWarnings = Array.from(
            state.localBuilders.entries(),
          ).flatMap(([builder, { def, calls }]) =>
            this.checkOverflows(def, calls, state.localBuilders, builder),
          );
          warnings = warnings.concat([...tempCellWarnings, ...builderWarnings]);
        });
      },
      { includeStdlib: false },
    );
    return warnings;
  }

  /**
   * Checks for references and data overflow in the given cell.
   * @param loc Position of the builder initialization to report.
   * @param calls Calls to examine, including all operations on the builder, such as `endCell`.
   */
  private checkOverflows(
    loc: SrcInfo,
    calls: Map<MethodAstId, AstMethodCall>,
    localBuilders: CellOverflowState["localBuilders"],
    builder?: BuilderName,
  ): MistiTactWarning[] {
    const warnings = [];
    const { storeRefs, storesSize } = Array.from(calls.values()).reduce(
      ({ storeRefs, storesSize }, call) => {
        // Process storeRef
        if (isStdlibCall("storeRef", call)) {
          // NOTE: We don't count storeMaybeRef since it could be null and
          // requires additional analysis
          storeRefs += 1;
        }
        // Process other store-operations
        storesSize += this.getStoreSize(call, localBuilders, new Set(builder));
        return { storeRefs, storesSize };
      },
      { storeRefs: 0, storesSize: 0n } as {
        storeRefs: number;
        storesSize: bigint;
      },
    );
    if (storeRefs > 4) {
      warnings.push(
        this.makeWarning("Maximum number of references exceeded", loc, {
          extraDescription:
            "Cells cannot contain more than 4 references to other cells",
          suggestion: "Remove extra .storeRef operations",
        }),
      );
    }
    if (storesSize > 1023n) {
      warnings.push(
        this.makeWarning(
          "Maximum amount of data stored in cell exceeded",
          loc,
          {
            extraDescription: `Cells cannot store more than 1023 bits (expected size: ${storesSize})`,
            suggestion: "Remove extra .store operations",
          },
        ),
      );
    }
    return warnings;
  }

  /**
   * Returns the storage size in bits for each store operation.
   * https://github.com/tact-lang/tact/blob/2315d035f5f9a22cad42657561c1a0eaef997b05/stdlib/std/cells.tact
   */
  private getStoreSize(
    call: AstMethodCall,
    localBuilders: CellOverflowState["localBuilders"],
    visited: Set<BuilderName> = new Set(),
  ): bigint {
    // Try to extract constant store size
    const size = getConstantStoreSize(call);
    if (size !== undefined) {
      return size;
    }

    // Process assignments to known local builders
    if (idText(call.method) === "storeBuilder") {
      // Try to find a stored builder in the dataflow state.
      if (call.args.length !== 1) return UNDECIDABLE;
      const arg = call.args[0];
      if (arg.kind === "id") {
        const builderName = idText(arg);
        if (visited.has(builderName)) {
          return 0n; // Avoid infinite recursion
        }
        const builder = localBuilders.get(builderName);
        if (builder) {
          visited.add(builderName);
          const res = Array.from(builder.calls.values()).reduce(
            (acc, bCall) =>
              acc + this.getStoreSize(bCall, localBuilders, visited),
            0n,
          );
          return res;
        }
      }
    }

    return UNDECIDABLE;
  }
}
