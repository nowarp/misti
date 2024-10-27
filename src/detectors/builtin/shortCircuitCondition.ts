import { CompilationUnit } from "../../internals/ir";
import {
  evalsToValue,
  foldStatements,
  forEachExpression,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import { AstExpression } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that suggests optimizing boolean expressions to leverage short-circuit evaluation.
 *
 * ## Why is it bad?
 * TVM supports short-circuit operations. When using logical AND (&&) operations,
 * placing constant or cheaper conditions first can prevent unnecessary execution
 * of expensive operations when the result is already determined.
 *
 * ## Example
 * ```tact
 * // Bad: Expensive operation is always executed
 * if (expensive_function() && constant_false) {
 *   // ...
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * // Good: Expensive operation is skipped when constant_false is false
 * if (constant_false && expensive_function()) {
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
            const leftConst = this.isConstantExpression(expr.left);
            const rightConst = this.isConstantExpression(expr.right);
            const leftExpensive = this.isExpensiveFunction(expr.left);
            if (
              (expr.op === "&&" && !leftConst && rightConst) ||
              (expr.op === "||" && leftConst && !rightConst)
            ) {
              acc.push(
                this.makeWarning(
                  `Consider reordering: ${
                    leftExpensive
                      ? "Move expensive function call to the end."
                      : "Move constant to the left."
                  }`,
                  expr.loc,
                  {
                    suggestion: `Reorder to optimize ${expr.op} condition short-circuiting`,
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

  private isExpensiveFunction(expr: AstExpression): boolean {
    const expensiveFunctions = ["long_running_fun", "expensive_function"];
    return (
      expr.kind === "method_call" && expensiveFunctions.includes(expr.kind)
    );
  }

  private isConstantExpression(expr: AstExpression): boolean {
    return (
      evalsToValue(expr, "boolean", true) ||
      evalsToValue(expr, "boolean", false) ||
      expr.kind === "boolean" ||
      (expr.kind === "op_binary" &&
        ["==", "!=", ">", "<", ">=", "<="].includes(expr.op))
    );
  }
}
