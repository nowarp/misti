import { CompilationUnit } from "../../internals/ir";
import {
  evalsToValue,
  foldStatements,
  forEachExpression,
  collectConditions,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import {
  AstContractInit,
  AstExpression,
  AstFunctionDef,
  AstReceiver,
  SrcInfo,
} from "@tact-lang/compiler/dist/grammar/ast";

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
            acc.push(this.warnCondition(expr));
          }
        });
        if (stmt.kind === "statement_condition") {
          collectConditions(stmt, { nonEmpty: true }).forEach((cond) => {
            if (this.constEvalToFalse(cond)) acc.push(this.warnCondition(cond));
          });
        }
        if (
          (stmt.kind === "statement_while" ||
            stmt.kind === "statement_until") &&
          stmt.statements.length > 0 &&
          this.constEvalToFalse(stmt.condition)
        ) {
          acc.push(this.warnCondition(stmt.condition));
        }
        if (
          stmt.kind === "statement_repeat" &&
          stmt.statements.length > 0 &&
          this.constEvalToZero(stmt.iterations)
        ) {
          acc.push(this.warnCondition(stmt.iterations, true));
        }
        return acc;
      },
      [] as MistiTactWarning[],
    );
  }

  private warnCondition(
    node: { loc: SrcInfo },
    isZero: boolean = false,
  ): MistiTactWarning {
    const message = isZero
      ? "Condition always evaluates to zero"
      : "Condition always evaluates to false";
    return this.makeWarning(message, node.loc, {
      suggestion: "Consider removing it if there is no logic error",
    });
  }

  private constEvalToZero = (expr: AstExpression): boolean =>
    evalsToValue(expr, "bigint", 0n);
  private constEvalToFalse = (expr: AstExpression): boolean =>
    evalsToValue(expr, "boolean", false);
}
