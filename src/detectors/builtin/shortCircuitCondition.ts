import { CompilationUnit } from "../../internals/ir";
import {
  foldStatements,
  forEachExpression,
  findInExpressions,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import { AstExpression } from "@tact-lang/compiler/dist/grammar/ast";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";

/**
 * A detector that suggests optimizing boolean expressions to leverage short-circuit evaluation.
 *
 * ## Why is it bad?
 * TVM supports short-circuit operations. When using logical AND (`&&`) or logical OR (`||`) operations,
 * placing cheaper conditions first can prevent unnecessary execution
 * of expensive operations when the result is already determined.
 *
 * ## Example
 * ```tact
 * // Bad: Expensive operation is always executed
 * if (expensive_function() && cheap_condition) {
 *   // ...
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * // Good: Expensive operation is skipped when cheap_condition is false
 * if (cheap_condition && expensive_function()) {
 *   // ...
 * }
 * ```
 */
export class ShortCircuitCondition extends ASTDetector {
  severity = Severity.LOW;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return Array.from(cu.ast.getFunctions()).reduce(
      (acc, fun) => acc.concat(this.checkFunction(fun)),
      [] as MistiTactWarning[],
    );
  }

  private checkFunction(fun: any): MistiTactWarning[] {
    return foldStatements(
      fun,
      (acc, stmt) => {
        forEachExpression(stmt, (expr) => {
          if (
            expr.kind === "op_binary" &&
            (expr.op === "&&" || expr.op === "||")
          ) {
            const leftExpensive = this.containsExpensiveCall(expr.left);
            const rightExpensive = this.containsExpensiveCall(expr.right);
            if (
              leftExpensive &&
              !rightExpensive &&
              !this.containsInitOf(expr.right)
            ) {
              acc.push(
                this.makeWarning(
                  `Consider reordering: Move expensive function call to the end`,
                  expr.loc,
                  {
                    suggestion: `Place cheaper conditions on the left to leverage short-circuiting: ${prettyPrint(
                      expr.right,
                    )} ${expr.op} ${prettyPrint(expr.left)}`,
                  },
                ),
              );
            }
          }
        });
        return acc;
      },
      [] as MistiTactWarning[],
    );
  }

  private containsExpensiveCall(expr: AstExpression | null): boolean {
    if (!expr) return false;
    return (
      findInExpressions(
        expr,
        (e) =>
          (e.kind === "method_call" || e.kind === "static_call") &&
          !this.containsInitOf(e),
      ) !== null
    );
  }

  private containsInitOf(expr: AstExpression | null): boolean {
    if (!expr) return false;
    return findInExpressions(expr, (e) => e.kind === "init_of") !== null;
  }
}
