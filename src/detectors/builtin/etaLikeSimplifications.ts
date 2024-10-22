// src/detectors/builtin/EtaLikeSimplifications.ts

import { CompilationUnit } from "../../internals/ir";
import { forEachStatement, forEachExpression } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstNode,
  AstStatement,
  AstExpression,
  AstOpBinary,
  idText,
  AstStatementReturn,
  AstConditional,
} from "@tact-lang/compiler/dist/grammar/ast";

export class EtaLikeSimplifications extends ASTDetector {
  severity = Severity.LOW;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    console.log("EtaLikeSimplifications detector is running");
    const warnings: MistiTactWarning[] = [];

    const entries = cu.ast.getProgramEntries();
    console.log("Number of program entries:", entries.length);

    for (const node of entries) {
      this.analyzeNode(node, warnings);
    }

    return warnings;
  }

  private analyzeNode(node: AstNode, warnings: MistiTactWarning[]): void {
    console.log("Analyzing node:", node.kind);

    forEachStatement(node, (stmt) => {
      console.log("Statement kind:", stmt.kind);
      this.checkStatement(stmt, warnings);
    });

    forEachExpression(node, (expr) => {
      console.log("Expression kind:", expr.kind);
      this.checkExpression(expr, warnings);
    });
  }

  private checkStatement(
    stmt: AstStatement,
    warnings: MistiTactWarning[],
  ): void {
    if (stmt.kind === "statement_condition") {
      const ifStmt = stmt;

      if (
        ifStmt.trueStatements.length === 1 &&
        ifStmt.falseStatements &&
        ifStmt.falseStatements.length === 1 &&
        ifStmt.trueStatements[0].kind === "statement_return" &&
        ifStmt.falseStatements[0].kind === "statement_return"
      ) {
        const trueReturn = ifStmt.trueStatements[0] as AstStatementReturn;
        const falseReturn = ifStmt.falseStatements[0] as AstStatementReturn;

        if (
          this.isBooleanLiteral(trueReturn.expression, true) &&
          this.isBooleanLiteral(falseReturn.expression, false)
        ) {
          warnings.push(
            this.makeWarning(
              "Simplify 'if' statement by returning the condition directly",
              stmt.loc,
              {
                suggestion: "Replace with 'return condition;'",
              },
            ),
          );
        }
      }
    }
  }

  private checkExpression(
    expr: AstExpression,
    warnings: MistiTactWarning[],
  ): void {
    // Check for `boolean_expression == true` or `boolean_expression == false`
    if (expr.kind === "op_binary") {
      const binaryExpr = expr as AstOpBinary;
      if (binaryExpr.op === "==" || binaryExpr.op === "!=") {
        const { left, right } = binaryExpr;
        if (this.isBooleanLiteral(right)) {
          warnings.push(
            this.makeWarning(
              `Redundant comparison with boolean literal`,
              expr.loc,
              {
                suggestion: `Use '${this.getSimplifiedBooleanExpression(
                  binaryExpr,
                )}' instead`,
              },
            ),
          );
        }
      }
    }

    // Check for conditional expressions like `cond ? true : false`
    if (expr.kind === "conditional") {
      const conditionalExpr = expr as AstConditional;
      if (
        this.isBooleanLiteral(conditionalExpr.thenBranch, true) &&
        this.isBooleanLiteral(conditionalExpr.elseBranch, false)
      ) {
        warnings.push(
          this.makeWarning(
            "Simplify conditional expression by using the condition directly",
            expr.loc,
            {
              suggestion: `Use '${this.getConditionText(conditionalExpr.condition)}' instead`,
            },
          ),
        );
      }
    }
  }

  private isBooleanLiteral(
    expr: AstExpression | null | undefined,
    value?: boolean,
  ): boolean {
    if (!expr) return false;
    if (expr.kind === "boolean") {
      if (value === undefined) {
        return true;
      }
      return expr.value === value;
    }
    return false;
  }

  private getSimplifiedBooleanExpression(binaryExpr: AstOpBinary): string {
    const exprText = (expr: AstExpression): string => {
      if (expr.kind === "id") {
        return idText(expr);
      }
      return "expression";
    };

    if (this.isBooleanLiteral(binaryExpr.right, true)) {
      if (binaryExpr.op === "==") {
        return exprText(binaryExpr.left);
      } else {
        return `!${exprText(binaryExpr.left)}`;
      }
    } else if (this.isBooleanLiteral(binaryExpr.right, false)) {
      if (binaryExpr.op === "==") {
        return `!${exprText(binaryExpr.left)}`;
      } else {
        return exprText(binaryExpr.left);
      }
    }
    return "expression";
  }

  private getConditionText(expr: AstExpression): string {
    if (expr.kind === "id") {
      return idText(expr);
    }
    return "condition";
  }
}
