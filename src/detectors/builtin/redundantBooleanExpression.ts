import { CompilationUnit } from "../../internals/ir";
import { foldExpressions, isComparison } from "../../internals/tact";
import { AstExpression } from "../../internals/tact/imports";
import { nodesAreEqual } from "../../internals/tact/util";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * Detects redundant or duplicated operands in boolean expressions.
 *
 * ## Why is it bad?
 * Duplicate conditions add no logical value, waste computation, and may indicate
 * copy-paste errors or logic mistakes.
 *
 * ## Example
 *
 * ```tact
 * // Bad: (self.a == 0) is checked twice
 * return (self.a == 0) || (self.a == 0);
 * ```
 *
 * Use instead:
 * ```tact
 * // Fix: Remove the duplicate
 * return (self.a == 0);
 * ```
 */
export class RedundantBooleanExpression extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      const visited = new Set<AstExpression["id"]>();

      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            if (visited.has(expr.id)) return acc;
            if (
              expr.kind === "op_binary" &&
              (expr.op === "&&" || expr.op === "||")
            ) {
              visited.add(expr.id);
              const operands: AstExpression[] = this.collectOperands(
                expr,
                expr.op,
              );
              const duplicates: AstExpression[] = this.findDuplicates(operands);
              operands.forEach((op) => visited.add(op.id));
              if (duplicates.length > 0) {
                acc.push(
                  this.makeWarning(
                    `Redundant boolean expression: found duplicate conditions`,
                    expr.loc,
                    {
                      suggestion:
                        "Remove duplicate conditions to simplify the expression.",
                    },
                  ),
                );
              }
            }
            return acc;
          },
          [] as Warning[],
          {
            shouldContinue: (expr) => {
              if (visited.has(expr.id)) {
                return false;
              }
              return !isComparison(expr);
            },
          },
        ),
      );
    }, [] as Warning[]);
  }

  /**
   * Recursively collect operands from a binary expression with the same operator
   */
  private collectOperands(
    expr: AstExpression,
    operator: string,
  ): AstExpression[] {
    if (expr.kind !== "op_binary" || expr.op !== operator) {
      return [expr];
    }
    const leftOperands = this.collectOperands(expr.left, operator);
    const rightOperands = this.collectOperands(expr.right, operator);
    return [...leftOperands, ...rightOperands];
  }

  /**
   * Find duplicate expressions in a list of operands
   */
  private findDuplicates(operands: AstExpression[]): AstExpression[] {
    const duplicates: AstExpression[] = [];
    for (let i = 0; i < operands.length; i++) {
      for (let j = i + 1; j < operands.length; j++) {
        if (nodesAreEqual(operands[i], operands[j])) {
          duplicates.push(operands[j]);
        }
      }
    }
    return duplicates;
  }
}
