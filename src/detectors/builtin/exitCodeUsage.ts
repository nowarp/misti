import { InternalException } from "../../internals/exceptions";
import { CFG, BasicBlock, CompilationUnit } from "../../internals/ir";
import {
  IntervalJoinSemiLattice,
  JoinSemilattice,
  WideningLattice,
} from "../../internals/lattice";
import { Interval, Num } from "../../internals/numbers";
import { WideningWorklistSolver } from "../../internals/solver";
import { findInExpressions } from "../../internals/tact/iterators";
import { Transfer } from "../../internals/transfer";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { DataflowDetector } from "../detector";
import {
  AstStatement,
  AstId,
  idText,
  AstExpression,
  AstStatementAssign,
  AstStatementLet,
  AstNumber,
} from "@tact-lang/compiler/dist/grammar/ast";

type Variable = string & { readonly __brand: unique symbol };

type VariableState = Map<Variable, Interval>;

class ExitCodeLattice
  implements JoinSemilattice<VariableState>, WideningLattice<VariableState>
{
  private intervalLattice = new IntervalJoinSemiLattice();
  private widenCount = new Map<Variable, number>();
  private readonly WIDENING_THRESHOLD = 3;

  bottom(): VariableState {
    return new Map();
  }

  join(a: VariableState, b: VariableState): VariableState {
    const result = new Map<Variable, Interval>();
    const variables = new Set([...a.keys(), ...b.keys()]);
    for (const variable of variables) {
      const intervalA = a.get(variable) || this.intervalLattice.bottom();
      const intervalB = b.get(variable) || this.intervalLattice.bottom();
      const joinedInterval = this.intervalLattice.join(intervalA, intervalB);
      result.set(variable, joinedInterval);
    }
    return result;
  }

  leq(a: VariableState, b: VariableState): boolean {
    for (const [variable, intervalA] of a.entries()) {
      const intervalB = b.get(variable) || this.intervalLattice.bottom();
      if (!this.intervalLattice.leq(intervalA, intervalB)) {
        return false;
      }
    }
    return true;
  }

  widen(oldState: VariableState, newState: VariableState): VariableState {
    const result = new Map<Variable, Interval>();
    const variables = new Set([...oldState.keys(), ...newState.keys()]);

    for (const variable of variables) {
      // Track widening iterations per variable
      const count = (this.widenCount.get(variable) || 0) + 1;
      this.widenCount.set(variable, count);
      const intervalOld =
        oldState.get(variable) || this.intervalLattice.bottom();
      const intervalNew =
        newState.get(variable) || this.intervalLattice.bottom();

      // If we've widened too many times, jump straight to ±∞
      let widenedInterval: Interval;
      if (count > this.WIDENING_THRESHOLD) {
        widenedInterval = IntervalJoinSemiLattice.topValue;
      } else {
        widenedInterval = this.intervalLattice.widen(intervalOld, intervalNew);
      }

      result.set(variable, widenedInterval);
    }
    return result;
  }
}

class ExitCodeTransfer implements Transfer<VariableState> {
  transfer(
    inState: VariableState,
    _bb: BasicBlock,
    stmt: AstStatement,
  ): VariableState {
    const outState = new Map(inState);

    if (stmt.kind === "statement_assign") {
      const assignStmt = stmt as AstStatementAssign;
      const varName = this.extractVariableName(assignStmt.path);
      if (varName) {
        const exprInterval = this.evaluateExpression(
          assignStmt.expression,
          inState,
        );
        outState.set(varName as Variable, exprInterval);
      }
    } else if (stmt.kind === "statement_let") {
      const letStmt = stmt as AstStatementLet;
      const varName = idText(letStmt.name);
      const exprInterval = this.evaluateExpression(letStmt.expression, inState);
      outState.set(varName as Variable, exprInterval);
    }

    return outState;
  }

  private extractVariableName(expr: AstExpression): string | null {
    return expr.kind === "id" ? idText(expr) : null;
  }

  private evaluateExpression(
    expr: AstExpression,
    state: VariableState,
  ): Interval {
    if (expr.kind === "number") {
      const exprNum = expr as AstNumber;
      const value = BigInt(exprNum.value);
      return Interval.fromNum(value);
    } else if (expr.kind === "id") {
      const varName = idText(expr) as Variable;
      return state.get(varName) || IntervalJoinSemiLattice.topValue;
    } else if (expr.kind === "op_binary") {
      const leftInterval = this.evaluateExpression(expr.left, state);
      const rightInterval = this.evaluateExpression(expr.right, state);
      switch (expr.op) {
        case "+":
          return leftInterval.plus(rightInterval);
        case "-":
          return leftInterval.minus(rightInterval);
        case "*":
          return leftInterval.times(rightInterval);
        case "/":
          return leftInterval.div(rightInterval);
        default:
          return IntervalJoinSemiLattice.topValue;
      }
    }
    return IntervalJoinSemiLattice.topValue;
  }
}

/**
 * A detector that identifies improper use of exit codes outside the developer-allowed range.
 *
 * ## Why is it bad?
 * In the TON blockchain, exit codes are divided into specific ranges: 0 to 127
 * are reserved for the TVM or FunC, and 128 to 255 are reserved for Tact. This
 * structure leaves the range from 256 to 65535 for developers to define custom
 * exit codes.
 *
 * When exit codes are defined outside this allowed range, it may lead to
 * conflicts with existing reserved codes, causing unintended behavior or
 * errors in the contract.
 *
 * ## Example
 * ```tact
 * contract Foo {
 *     receive("foobar") {
 *         // Bad: exit code defined in the reserved range for Tact
 *         let code: Int = 128;
 *         nativeThrowUnless(code, sender() == self.owner);
 *     }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Foo {
 *     receive("foobar") {
 *         // OK: using exit code from the allowed range
 *         let code: Int = 256;
 *         nativeThrowUnless(code, sender() == self.owner);
 *     }
 * }
 * ```
 *
 * ## Resources
 * 1. [Exit Codes | Tact Docs](https://docs.tact-lang.org/book/exit-codes)
 */
export class ExitCodeUsage extends DataflowDetector {
  severity = Severity.HIGH;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];

    cu.forEachCFG(
      (cfg: CFG) => {
        const node = cu.ast.getFunction(cfg.id);
        if (node === undefined) {
          return;
        }
        const lattice = new ExitCodeLattice();
        const transfer = new ExitCodeTransfer();
        const solver = new WideningWorklistSolver<VariableState>(
          cu,
          cfg,
          transfer,
          lattice,
          "forward",
          5,
        );
        const results = solver.solve();
        for (const bb of cfg.nodes) {
          const state = results.getState(bb.idx);
          if (state) {
            this.checkStateForWarnings(cu, state, bb, warnings);
          }
        }
      },
      { includeStdlib: false },
    );
    return warnings;
  }

  private checkStateForWarnings(
    cu: CompilationUnit,
    state: VariableState,
    bb: BasicBlock,
    warnings: MistiTactWarning[],
  ): void {
    const stmt = cu.ast.getStatement(bb.stmtID);
    if (!stmt) {
      throw InternalException.make(`Cannot find a statement for BB #${bb.idx}`);
    }
    // TODO: Handle direct cases e.g. throw(128)
    const exitVariable = this.findExitVariable(stmt);
    if (exitVariable === null) {
      return;
    }
    const exitVariableName = idText(exitVariable);
    for (const [varName, interval] of state.entries()) {
      if (
        exitVariableName === varName &&
        this.isOutsideAllowedRange(interval)
      ) {
        warnings.push(
          this.makeWarning(
            `Exit code variable "${varName}" has value outside allowed range`,
            exitVariable.loc,
            {
              extraDescription: `Exit codes 0-255 are reserved. Variable value: ${interval.toString()}`,
              suggestion: "Use a value between 256 and 65535",
            },
          ),
        );
      }
    }
  }

  private isOutsideAllowedRange(interval: Interval): boolean {
    const lowerBound = interval.low;
    const upperBound = interval.high;

    // Developer-allowed range is 256 to 65535
    const belowMin = Num.compare(upperBound, Num.int(256n)) < 0;
    const aboveMax = Num.compare(lowerBound, Num.int(65535n)) > 0;

    return belowMin || aboveMax;
  }

  /**
   * Finds a local variable used as an exit code.
   */
  private findExitVariable(stmt: AstStatement): AstId | null {
    let result: AstId | null = null;
    // The first argument of these functions is an exit code:
    // https://docs.tact-lang.org/ref/core-debug/#throw
    const throwFunctions = new Set([
      "throw",
      "nativeThrow",
      "nativeThrowIf",
      "nativeThrowUnless",
    ]);
    findInExpressions(stmt, (expr) => {
      if (
        expr.kind === "static_call" &&
        expr.args.length > 0 &&
        throwFunctions.has(idText(expr.function)) &&
        expr.args[0].kind === "id"
      ) {
        result = expr.args[0];
        return true;
      }
      return false;
    });
    return result;
  }
}
