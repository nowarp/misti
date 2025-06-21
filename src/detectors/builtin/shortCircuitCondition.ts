import { CompilationUnit } from "../../internals/ir";
import {
  evalsToLiteral,
  foldStatements,
  forEachExpression,
  findInExpressions,
  MakeLiteral,
} from "../../internals/tact";
import {
  AstExpression,
  idText,
  prettyPrint,
} from "../../internals/tact/imports";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that suggests optimizing boolean expressions to leverage short-circuit evaluation.
 *
 * ## Why is it bad?
 * TVM supports short-circuit operations. When using logical AND (`&&`) or logical OR (`||`) operations,
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
export class ShortCircuitCondition extends AstDetector {
  severity = Severity.LOW;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    const cheapFunctions = this.getCheapStdlibFunctions(cu);
    return Array.from(cu.ast.getFunctions()).reduce(
      (acc, fun) => acc.concat(this.checkFunction(fun, cheapFunctions)),
      [] as Warning[],
    );
  }

  /**
   * Heuristics to detect cheap stdlib functions that should not be reported.
   */
  private getCheapStdlibFunctions(cu: CompilationUnit): string[] {
    return Array.from(cu.ast.getAsmFunctions({ includeStdlib: true })).reduce(
      (acc, f) => {
        if (
          f.loc.origin === "stdlib" &&
          f.attributes.length === 0 &&
          f.return !== undefined &&
          !idText(f.name).includes("Random") &&
          (f.loc.file?.endsWith("time.tact") ||
            f.loc.file?.endsWith("math.tact"))
        ) {
          acc.push(idText(f.name));
        }
        return acc;
      },
      [] as string[],
    );
  }

  private checkFunction(fun: any, skipFunNames: string[]): Warning[] {
    return foldStatements(
      fun,
      (acc, stmt) => {
        forEachExpression(stmt, (expr) => {
          if (
            expr.kind === "op_binary" &&
            (expr.op === "&&" || expr.op === "||")
          ) {
            const leftExpensive = this.containsExpensiveCall(
              expr.left,
              skipFunNames,
            );
            const rightExpensive = this.containsExpensiveCall(
              expr.right,
              skipFunNames,
            );
            const leftIsConstant = this.isConstantExpression(expr.left);
            const rightIsConstant = this.isConstantExpression(expr.right);
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
            if (
              !leftIsConstant &&
              rightIsConstant &&
              !this.containsInitOf(expr.left)
            ) {
              acc.push(
                this.makeWarning(
                  `Consider reordering: Move constant to the left`,
                  expr.loc,
                  {
                    suggestion: `Reorder to optimize ${expr.op} condition short-circuiting: ${prettyPrint(
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
      [] as Warning[],
    );
  }

  private containsExpensiveCall(
    expr: AstExpression | null,
    skipFunNames: string[],
  ): boolean {
    if (!expr) return false;
    return (
      findInExpressions(
        expr,
        (e) =>
          (e.kind === "method_call" ||
            (e.kind === "static_call" &&
              !skipFunNames.includes(idText(e.function)))) &&
          !this.containsInitOf(e),
      ) !== null
    );
  }

  private isConstantExpression(expr: AstExpression | null): boolean {
    if (!expr) return false;
    return (
      evalsToLiteral(expr, MakeLiteral.boolean(true)) ||
      evalsToLiteral(expr, MakeLiteral.boolean(false)) ||
      expr.kind === "boolean" ||
      expr.kind === "number" ||
      expr.kind === "string" ||
      expr.kind === "null"
    );
  }

  private containsInitOf(expr: AstExpression | null): boolean {
    if (!expr) return false;
    return findInExpressions(expr, (e) => e.kind === "init_of") !== null;
  }
}
