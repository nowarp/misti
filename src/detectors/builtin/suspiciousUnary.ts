import { CompilationUnit } from "../../internals/ir";
import { foldStatements } from "../../internals/tact";
import { AstExpression, prettyPrint } from "../../internals/tact/imports";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that highlights unusual unary expressions that look like a typo.
 *
 * ## Why is it bad?
 * Having unary expressions such as `x =+ 1` or `return + 1;` is probably a
 * typo. Most likely, the developer intended to use a binary operation in that
 * case and forgot the left-hand side expression.
 *
 * ## Example
 * ```tact
 * a =+ 1; // Suspicious
 * ```
 *
 * Use instead:
 * ```tact
 * a += 1; // Fixed
 * ```
 */
export class SuspiciousUnary extends AstDetector {
  severity = Severity.LOW;
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldStatements(
          node,
          (acc, stmt) => {
            if (
              (stmt.kind === "statement_let" ||
                stmt.kind === "statement_return" ||
                stmt.kind === "statement_assign" ||
                stmt.kind === "statement_augmentedassign") &&
              stmt.expression !== undefined &&
              this.isSuspicious(stmt.expression)
            ) {
              acc.push(
                this.makeWarning(
                  "Suspicious unary expression",
                  stmt.expression.loc,
                  {
                    extraDescription: `${prettyPrint(stmt.expression)} in that position may indicate typo`,
                    suggestion: "Consider refactoring removing the unary `+`",
                  },
                ),
              );
            }
            return acc;
          },
          [] as Warning[],
        ),
      );
    }, [] as Warning[]);
  }

  private isSuspicious(expr: AstExpression): boolean {
    return (
      expr.kind === "op_unary" &&
      expr.op === "+" &&
      expr.operand.kind === "number"
    );
  }
}
