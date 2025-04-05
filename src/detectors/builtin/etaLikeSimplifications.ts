import { CompilationUnit } from "../../internals/ir";
import {
  makeRange,
  makeReplace,
  makeReplacement,
} from "../../internals/quickfix";
import {
  forEachStatement,
  forEachExpression,
  MakeLiteral,
} from "../../internals/tact";
import { evalToType, evalsToLiteral } from "../../internals/tact/";
import {
  AstNode,
  AstStatement,
  AstExpression,
  AstOpBinary,
  AstOpUnary,
  prettyPrint,
} from "../../internals/tact/imports";
import { Category, MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * Detects opportunities for simplifying code by eliminating redundant boolean expressions and statements.
 *
 * ## Why is it bad?
 * Redundant code can make programs less efficient and harder to read. Simplifying such code improves readability,
 * maintainability, and can prevent potential logical errors.
 *
 * **What it checks:**
 * - `if` statements that return boolean literals directly based on a condition.
 * - Comparisons of boolean expressions with boolean literals (`true` or `false`).
 * - Conditional expressions (ternary operators) that return boolean literals.
 *
 * ## Example
 *
 * ```tact
 * // Redundant 'if' statement:
 * if (condition) {
 *     return true;
 * } else {
 *     return false;
 * }
 * // Simplify to:
 * return condition;
 *
 * // Redundant comparison:
 * return a == true;
 * // Simplify to:
 * return a;
 *
 * // Redundant conditional expression:
 * return b ? true : false;
 * // Simplify to:
 * return b;
 * ```
 */
export class EtaLikeSimplifications extends AstDetector {
  severity = Severity.LOW;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    const entries = cu.ast.getProgramEntries();
    for (const node of entries) {
      this.analyzeNode(node, warnings);
    }
    return warnings;
  }

  private analyzeNode(node: AstNode, warnings: MistiTactWarning[]): void {
    forEachStatement(node, (stmt) => {
      this.checkStatement(stmt, warnings);
    });
    forEachExpression(node, (expr) => {
      this.checkExpression(expr, warnings);
    });
  }

  private checkStatement(
    stmt: AstStatement,
    warnings: MistiTactWarning[],
  ): void {
    if (
      stmt.kind === "statement_condition" &&
      stmt.trueStatements.length === 1 &&
      stmt.falseStatements &&
      stmt.falseStatements.length === 1 &&
      stmt.trueStatements[0].kind === "statement_return" &&
      stmt.falseStatements[0].kind === "statement_return" &&
      this.isBooleanLiteral(stmt.trueStatements[0].expression, true) &&
      this.isBooleanLiteral(stmt.falseStatements[0].expression, false)
    ) {
      const desc = "Return the condition directly";
      warnings.push(
        this.makeWarning(desc, stmt.loc, {
          quickfixes: [
            makeReplace(
              desc,
              true,
              makeReplacement(
                makeRange(stmt.loc),
                `return ${prettyPrint(stmt.condition)};`,
              ),
            ),
          ],
        }),
      );
    }
  }

  private checkExpression(
    expr: AstExpression,
    warnings: MistiTactWarning[],
  ): void {
    if (expr.kind === "op_binary") {
      const binaryExpr = expr as AstOpBinary;
      if (binaryExpr.op === "==" || binaryExpr.op === "!=") {
        const { right } = binaryExpr;
        if (this.isBooleanLiteral(right)) {
          const simplified = this.getSimplifiedBooleanExpression(binaryExpr);
          warnings.push(
            this.makeWarning(
              "Redundant comparison with boolean literal",
              expr.loc,
              {
                suggestion: prettyPrint(simplified),
              },
            ),
          );
        }
      }
    }
    if (expr.kind === "conditional") {
      if (
        this.isBooleanLiteral(expr.thenBranch, true) &&
        this.isBooleanLiteral(expr.elseBranch, false)
      ) {
        warnings.push(
          this.makeWarning(
            "Simplify conditional expression by using the condition directly",
            expr.loc,
            {
              suggestion: prettyPrint(expr.condition),
            },
          ),
        );
      }
    }
  }

  private isBooleanLiteral(
    expr: AstExpression | undefined,
    value?: boolean,
  ): boolean {
    if (expr == undefined) return false;
    return value === undefined
      ? evalToType(expr, "boolean") !== undefined
      : evalsToLiteral(expr, MakeLiteral.boolean(value));
  }

  private getSimplifiedBooleanExpression(
    binaryExpr: AstOpBinary,
  ): AstExpression {
    const negated = binaryExpr.op === "!=";
    if (this.isBooleanLiteral(binaryExpr.right, true)) {
      return negated
        ? ({
            kind: "op_unary",
            op: "!",
            operand: binaryExpr.left,
            id: binaryExpr.id,
            loc: binaryExpr.loc,
          } as AstOpUnary)
        : binaryExpr.left;
    } else if (this.isBooleanLiteral(binaryExpr.right, false)) {
      return negated
        ? binaryExpr.left
        : ({
            kind: "op_unary",
            op: "!",
            operand: binaryExpr.left,
            id: binaryExpr.id,
            loc: binaryExpr.loc,
          } as AstOpUnary);
    }
    return binaryExpr;
  }
}
