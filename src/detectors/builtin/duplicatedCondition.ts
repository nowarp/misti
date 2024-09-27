import { CompilationUnit } from "../../internals/ir";
import {
  foldExpressions,
  foldStatements,
  nodesAreEqual,
} from "../../internals/tactASTUtil";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstConditional,
  AstCondition,
  AstExpression,
} from "@tact-lang/compiler/dist/grammar/ast";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";

/**
 * A detector that finds duplicated conditions appearing in conditional expressions.
 *
 * ## Why is it bad?
 * Typically, these cases are developer errors caused by copy-pasting code, leading
 * to unreachable code.
 *
 * ## Example
 * ```tact
 * fun test(a: Int): Int {
 *   if (a < 1) { return 1; }
 *   else if (a > 4) { return 2; }
 *   // Bad: A developer copy-pasted the condition
 *   else if (a > 4) { return 3; }
 *   return 4;
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * fun test(a: Int): Int {
 *   if (a < 1) { return 1; }
 *   else if (a > 4) { return 2; }
 *   // OK: Fixed
 *   else if (a < x) { return 3; }
 *   return 4;
 * }
 * ```
 */
export class DuplicatedCondition extends ASTDetector {
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      const exprWarnings = foldExpressions(
        node,
        [] as MistiTactWarning[],
        (acc, expr) => {
          return expr.kind === "conditional"
            ? this.checkConditionalExpression(acc, expr)
            : acc;
        },
      );
      const stmtWarnings = foldStatements(
        node,
        [] as MistiTactWarning[],
        (acc, stmt) => {
          return stmt.kind === "statement_condition"
            ? this.checkConditionalStatement(acc, stmt)
            : acc;
        },
      );
      return acc.concat(...stmtWarnings, ...exprWarnings);
    }, [] as MistiTactWarning[]);
  }

  private checkConditionalExpression(
    acc: MistiTactWarning[],
    expr: AstConditional,
  ): MistiTactWarning[] {
    const allConditions = this.collectConditionalExpressions(expr);
    return this.checkConditions(acc, allConditions);
  }

  private checkConditionalStatement(
    acc: MistiTactWarning[],
    stmt: AstCondition,
  ): MistiTactWarning[] {
    const allConditions = this.collectConditionalStatements(stmt);
    return this.checkConditions(acc, allConditions);
  }

  private checkConditions(
    acc: MistiTactWarning[],
    allConditions: (AstExpression | AstStatement)[],
  ): MistiTactWarning[] {
    allConditions.forEach((lhs, index) => {
      allConditions.slice(index + 1).forEach((rhs) => {
        if (nodesAreEqual(lhs, rhs)) {
          const lhsStr = prettyPrint(lhs);
          const rhsStr = prettyPrint(rhs);
          let desc = "";
          if (lhsStr === rhsStr) {
            const lhsLc = lhs.loc.interval.getLineAndColumn() as {
              lineNum: number;
              colNum: number;
            };
            const rhsLc = rhs.loc.interval.getLineAndColumn() as {
              lineNum: number;
              colNum: number;
            };
            desc = `Condition ${lhsStr} appears at ${lhsLc.lineNum}:${lhsLc.colNum} and ${rhsLc.lineNum}:${rhsLc.colNum}`;
          } else {
            desc = `Conditions ${lhsStr} and ${rhsStr} are equal`;
          }
          acc.push(
            this.makeWarning(desc, Severity.HIGH, lhs.loc, {
              suggestion:
                "Consider removing an extra condition or changing it.",
            }),
          );
        }
      });
    });
    return acc;
  }

  /**
   * Collects all the conditions from the ternary conditional expression, including
   * nested "else-if" operations.
   */
  private collectConditionalExpressions(node: AstConditional): AstExpression[] {
    const conditions: AstExpression[] = [node.condition];
    if (node.thenBranch && node.thenBranch.kind === "conditional") {
      conditions.push(...this.collectConditionalExpressions(node.thenBranch));
    }
    if (node.elseBranch && node.elseBranch.kind === "conditional") {
      conditions.push(...this.collectConditionalExpressions(node.elseBranch));
    }
    return conditions;
  }

  /**
   * Collects all the conditions from the conditional statement.
   */
  private collectConditionalStatements(node: AstCondition): AstExpression[] {
    const conditions: AstExpression[] = [node.condition];
    if (node.elseif) {
      conditions.push(...this.collectConditionalStatements(node.elseif));
    }
    return conditions;
  }
}
