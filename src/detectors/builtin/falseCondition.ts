import { CompilationUnit } from "../../internals/ir";
import { makeDelete, makeRange } from "../../internals/quickfix";
import {
  evalsToLiteral,
  foldStatements,
  forEachExpression,
  collectConditions,
  MakeLiteral,
} from "../../internals/tact";
import {
  AstContractInit,
  AstExpression,
  AstFunctionDef,
  AstReceiver,
  SrcInfo,
} from "../../internals/tact/imports";
import { Category, MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that highlights conditions that evaluate to a constant `true` or `false`
 * in `if`, `while`, or `until` statements, and zero iterations in `repeat` statements.
 *
 * ## Why is it bad?
 * Conditions that always evaluate to a constant `true` or `false` are likely the result of a typo
 * or logic error. Such conditions can lead to unintended behavior, dead code, or incorrect control flow.
 * This detector helps identify these cases so they can be corrected, improving the code's reliability.
 *
 * ## Example
 * ```tact
 * const FALSE: Bool = false;
 * // Bad: Always false because of operator precedence
 * if ((param | value) & FALSE) {
 *  // ... never executed
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * const FALSE: Bool = false;
 * // OK: Fixed after the analyzer highlighted this
 * if (param) {}
 * ```
 */
export class FalseCondition extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return Array.from(cu.ast.getFunctions()).reduce(
      (acc, fun) => acc.concat(this.checkFunction(fun)),
      [] as MistiTactWarning[],
    );
  }

  /**
   * Checks if the given function contains any false conditions.
   */
  private checkFunction(
    fun: AstFunctionDef | AstReceiver | AstContractInit,
  ): MistiTactWarning[] {
    return foldStatements(
      fun,
      (acc, stmt) => {
        forEachExpression(stmt, (expr) => {
          if (
            expr.kind === "conditional" &&
            this.constEvalToFalse(expr.condition)
          ) {
            acc.push(this.warnCondition(stmt));
          }
        });
        if (stmt.kind === "statement_condition") {
          collectConditions(stmt, { nonEmpty: true }).forEach((cond) => {
            if (this.constEvalToFalse(cond)) acc.push(this.warnCondition(stmt));
          });
        }
        if (
          (stmt.kind === "statement_while" ||
            stmt.kind === "statement_until") &&
          stmt.statements.length > 0 &&
          this.constEvalToFalse(stmt.condition)
        ) {
          acc.push(this.warnCondition(stmt));
        }
        if (
          stmt.kind === "statement_repeat" &&
          stmt.statements.length > 0 &&
          this.constEvalToZero(stmt.iterations)
        ) {
          acc.push(this.warnCondition(stmt, true));
        }
        return acc;
      },
      [] as MistiTactWarning[],
    );
  }

  private warnCondition(
    stmt: { loc: SrcInfo },
    isZero: boolean = false,
  ): MistiTactWarning {
    const message = isZero
      ? "Condition always evaluates to zero"
      : "Condition always evaluates to false";
    return this.makeWarning(message, stmt.loc, {
      quickfixes: [
        makeDelete("Remove the condition", true, makeRange(stmt.loc)),
      ],
    });
  }

  private constEvalToZero = (expr: AstExpression): boolean =>
    evalsToLiteral(expr, MakeLiteral.number(0n));
  private constEvalToFalse = (expr: AstExpression): boolean =>
    evalsToLiteral(expr, MakeLiteral.boolean(false));
}
