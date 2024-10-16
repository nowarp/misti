import { InternalException } from "../../internals/exceptions";
import { BasicBlock, CFG, CompilationUnit } from "../../internals/ir";
import { JoinSemilattice } from "../../internals/lattice";
import { WorklistSolver } from "../../internals/solver/";
import { evalToType } from "../../internals/tact/";
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
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * The storage used by the store operation or the presence of the reference is
 * statically unknown.
 */
const UNDECIDABLE = 0n;

type BuilderName = string;
type MethodAstId = number;

/** Part of the method call focused on the used method and its arguments. */
type MethodCallInfo = { method: AstId; args: AstExpression[]; loc: SrcInfo };

/** Temporary cell objects: `beginCell().<ops>.endCell()` */
type TempCell = {
  // Position of `beginCell()`
  loc: SrcInfo;
  // Method calls other than `beginCell`.
  // Includes `endCell` for consistency.
  calls: Map<MethodAstId, MethodCallInfo>;
};

interface CellOverflowState {
  // Temporary cell objects created using `beginCell().<ops>.endCell()`
  tempCells: TempCell[];
  // Local variables of the Builder type and information on methods calls used over them
  localBuilders: Map<
    BuilderName,
    { def: SrcInfo; calls: Map<MethodAstId, MethodCallInfo> }
  >;
}

/**
 * Adds a new variable to `localBuilders`.
 */
function addLocalBuilder(
  state: CellOverflowState,
  id: AstId,
  calls: Map<MethodAstId, MethodCallInfo> = new Map(),
): void {
  state.localBuilders.set(idText(id), { def: id.loc, calls });
}

/**
 * Initializes or appends method calls to an existing variable in `localBuilders`.
 */
function addCalls(
  state: CellOverflowState,
  name: BuilderName,
  calls: Map<MethodAstId, MethodCallInfo>,
): void | never {
  if (calls.size === 0) {
    return;
  }
  const builder = state.localBuilders.get(name);
  if (builder) {
    if (!hasEndCell(builder.calls)) {
      const filterCallsBeforeEndCell = (
        calls: Map<MethodAstId, MethodCallInfo>,
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

function isBeginCell(firstReceiver: AstExpression): boolean {
  return (
    firstReceiver.kind === "static_call" &&
    idText(firstReceiver.function) === "beginCell" &&
    firstReceiver.args.length === 0
  );
}

function hasEndCell(calls: Map<MethodAstId, MethodCallInfo>): boolean {
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
    }
    this.processStoreCalls(outState, stmt);
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
    if (isBeginCell(firstReceiver) && !hasEndCell(calls)) {
      addLocalBuilder(outState, stmt.name);
      addCalls(outState, idText(stmt.name), calls);
    }
  }

  /**
   * Processes the .store operations on the previously added local variables
   * with `Builder` type or intermediate Cell objects (beginCell().<ops>.endCell())
   */
  private processStoreCalls(outState: CellOverflowState, node: AstNode): void {
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
        } else {
          // Track method calls of the known local builders
          const builderName = this.getKnownBuilderName(outState, firstReceiver);
          if (builderName) {
            addCalls(outState, builderName, calls);
          }
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
    | { firstReceiver: AstExpression; calls: Map<MethodAstId, MethodCallInfo> }
    | undefined {
    const calls = new Map<MethodAstId, MethodCallInfo>();
    let currentExpr: AstExpression = expr;
    while (currentExpr.kind === "method_call") {
      const methodCall = currentExpr as AstMethodCall;
      calls.set(methodCall.method.id, {
        method: methodCall.method,
        args: methodCall.args,
        loc: methodCall.loc,
      });
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
    calls: Map<MethodAstId, MethodCallInfo>,
  ): boolean {
    return isBeginCell(firstReceiver) && hasEndCell(calls);
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
    calls: Map<MethodAstId, MethodCallInfo>,
    localBuilders: CellOverflowState["localBuilders"],
    builder?: BuilderName,
  ): MistiTactWarning[] {
    if (!hasEndCell(calls)) {
      // The cell creation is not complete in the current state
      return [];
    }
    const warnings = [];
    const { storeRefs, storesSize } = Array.from(calls.values()).reduce(
      ({ storeRefs, storesSize }, call) => {
        // Process storeRef
        if (idText(call.method) === "storeRef") {
          // NOTE: We don't count storeMaybeRef since it could be null and
          // requires additional analysis
          storeRefs += 1;
        }
        // Process other store-operations
        storesSize += this.getStoreCost(call, localBuilders, new Set(builder));
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
   * Returns the storage cost in bits for each store operation.
   * https://github.com/tact-lang/tact/blob/2315d035f5f9a22cad42657561c1a0eaef997b05/stdlib/std/cells.tact
   */
  private getStoreCost(
    call: MethodCallInfo,
    localBuilders: CellOverflowState["localBuilders"],
    visited: Set<BuilderName> = new Set(),
  ): bigint {
    const checkArgLength = (expectedLength: number): boolean => {
      if (call.args.length !== expectedLength) {
        this.ctx.logger.error(
          [
            `.${idText(call.method)}(...) is expected to have ${expectedLength} argument(s).`,
            "Perhaps, you should update Misti.",
          ].join(" "),
        );
        return false;
      }
      return true;
    };
    switch (idText(call.method)) {
      case "storeBool":
      case "storeBit":
        return 1n;
      case "storeCoins": {
        if (!checkArgLength(1)) return UNDECIDABLE;
        // The serialization size varies from 4 to 124 bits:
        // https://docs.tact-lang.org/book/integers/#serialization-coins
        const value = evalToType(call.args[0], "bigint");
        if (value !== undefined) {
          const numValue = Number(value);
          if (!isNaN(numValue) && isFinite(numValue)) {
            // We use the following logic from ton-core in order to compute the size:
            // https://github.com/ton-org/ton-core/blob/00fa47e03c2a78c6dd9d09e517839685960bc2fd/src/boc/BitBuilder.ts#L212
            const sizeBytes = Math.ceil(numValue.toString(2).length / 8);
            const sizeBits = sizeBytes * 8;
            // 44-bit unsigned big-endian integer storing the byte length of the
            // value provided
            const sizeLength = 4;
            return BigInt(sizeBits + sizeLength);
          }
        }
        return UNDECIDABLE;
      }
      case "storeAddress":
        return 267n;
      case "storeInt":
      case "storeUint": {
        if (!checkArgLength(2)) return UNDECIDABLE;
        const value = evalToType(call.args[1], "bigint");
        return value === undefined ? UNDECIDABLE : (value as bigint);
      }
      case "storeBuilder": {
        // Try to find a stored builder in the dataflow state.
        if (!checkArgLength(1)) return UNDECIDABLE;
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
                acc + this.getStoreCost(bCall, localBuilders, visited),
              0n,
            );
            return res;
          }
        }
        return UNDECIDABLE;
      }
      case "storeSlice":
        return UNDECIDABLE;
      default:
        return UNDECIDABLE;
    }
  }
}
