import { InternalException } from "../../internals/exceptions";
import { CFG, BasicBlock, CompilationUnit } from "../../internals/ir";
import {
  Interval,
  Num,
  IntervalJoinSemiLattice,
  JoinSemilattice,
  intervalToString,
} from "../../internals/lattice";
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

export type Variable = string & { readonly __brand: unique symbol };

export type VariableState = Map<Variable, Interval>;

export class ExitCodeLattice implements JoinSemilattice<VariableState> {
  bottom(): VariableState {
    return new Map();
  }

  join(a: VariableState, b: VariableState): VariableState {
    const result = new Map<Variable, Interval>();
    const variables = new Set([...a.keys(), ...b.keys()]);
    for (const variable of variables) {
      const intervalA = a.get(variable) || IntervalJoinSemiLattice.bottom;
      const intervalB = b.get(variable) || IntervalJoinSemiLattice.bottom;
      const joinedInterval = IntervalJoinSemiLattice.join(intervalA, intervalB);
      result.set(variable, joinedInterval);
    }
    return result;
  }

  leq(a: VariableState, b: VariableState): boolean {
    for (const [variable, intervalA] of a.entries()) {
      const intervalB = b.get(variable) || IntervalJoinSemiLattice.bottom;
      if (!this.intervalLeq(intervalA, intervalB)) {
        return false;
      }
    }
    return true;
  }

  private intervalLeq(a: Interval, b: Interval): boolean {
    const lower = Num.compare(a[0], b[0]) >= 0;
    const upper = Num.compare(a[1], b[1]) <= 0;
    return lower && upper;
  }
}

export class ExitCodeTransfer implements Transfer<VariableState> {
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
    if (expr.kind === "id") {
      return idText(expr);
    }
    return null;
  }

  private evaluateExpression(
    expr: AstExpression,
    state: VariableState,
  ): Interval {
    if (expr.kind === "number") {
      const exprNum = expr as AstNumber;
      const value = BigInt(exprNum.value);
      return IntervalJoinSemiLattice.num(value);
    } else if (expr.kind === "id") {
      const varName = idText(expr) as Variable;
      return state.get(varName) || IntervalJoinSemiLattice.top;
    } else if (expr.kind === "op_binary") {
      const leftInterval = this.evaluateExpression(expr.left, state);
      const rightInterval = this.evaluateExpression(expr.right, state);
      switch (expr.op) {
        case "+":
          return IntervalJoinSemiLattice.plus(leftInterval, rightInterval);
        case "-":
          return IntervalJoinSemiLattice.minus(leftInterval, rightInterval);
        case "*":
          return IntervalJoinSemiLattice.times(leftInterval, rightInterval);
        case "/":
          return IntervalJoinSemiLattice.div(leftInterval, rightInterval);
        default:
          return IntervalJoinSemiLattice.top;
      }
    }
    return IntervalJoinSemiLattice.top;
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
              extraDescription: `Exit codes 0-255 are reserved. Variable value: ${intervalToString(interval)}`,
              suggestion: "Use a value between 256 and 65535",
            },
          ),
        );
      }
    }
  }

  private isOutsideAllowedRange(interval: Interval): boolean {
    const lowerBound = interval[0];
    const upperBound = interval[1];

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