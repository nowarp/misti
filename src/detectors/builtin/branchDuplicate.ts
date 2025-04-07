import { CompilationUnit } from "../../internals/ir";
import {
  foldExpressions,
  foldStatements,
  nodesAreEqual,
  statementsAreEqual,
} from "../../internals/tact";
import {
  AstStatementCondition,
  AstExpression,
  AstStatement,
} from "../../internals/tact/imports";
import { SrcInfo } from "../../internals/tact/imports";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * Detector that reports duplicated code in conditional branches.
 *
 * ## Why is it bad?
 * Duplicated code in branches is bad because it:
 * 1. **Reduces Readability**: Repetition makes the code harder to understand.
 * 2. **Increases Maintenance**: Changes must be made in multiple places, risking errors.
 * 3. **Signals Poor Design**: It suggests missed opportunities for cleaner, more abstract code.
 *
 * ## Example
 * ```tact
 * if (a > 42) {
 *   a = 43; // bad: duplicated code
 * } else {
 *   a = 43;
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * if (a > 42) {
 *   a = inc(b); // ok
 * } else {
 *   a = 43;
 * }
 * ```
 */
export class BranchDuplicate extends AstDetector {
  severity = Severity.HIGH;
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      const ternaryWarnings = foldExpressions(
        node,
        (acc, expr) => {
          return this.checkTernary(acc, expr);
        },
        [] as Warning[],
      );
      const conditionWarnings = foldStatements(
        node,
        (acc, stmt) => {
          return this.checkConditional(acc, stmt);
        },
        [] as Warning[],
      );
      return acc.concat([...conditionWarnings, ...ternaryWarnings]);
    }, [] as Warning[]);
  }

  /**
   * Looks for duplicates in ternary expressions.
   */
  private checkTernary(acc: Warning[], expr: AstExpression): Warning[] {
    if (
      expr.kind === "conditional" &&
      nodesAreEqual(expr.thenBranch, expr.elseBranch)
    ) {
      acc.push(this.createWarning(expr.thenBranch.loc, expr.elseBranch.loc));
    }
    return acc;
  }

  /**
   * Checks for duplicated conditions within an if-elseif-else chain.
   * If duplicates are found, a warning is added to the accumulator.
   */
  private checkConditional(acc: Warning[], stmt: AstStatement): Warning[] {
    if (stmt.kind === "statement_condition") {
      const allBranches = this.collectAllBranches(stmt);
      for (let i = 0; i < allBranches.length; i++) {
        for (let j = i; j < allBranches.length; j++) {
          const lhs = allBranches[i];
          const rhs = allBranches[j];
          if (i != j && statementsAreEqual(lhs, rhs)) {
            acc.push(this.createWarning(lhs[0].loc, rhs[0].loc));
            break;
          }
        }
      }
    }
    return acc;
  }

  private collectAllBranches(
    cond: AstStatementCondition,
  ): (readonly AstStatement[])[] {
    const branches: (readonly AstStatement[])[] = [];
    let current: AstStatementCondition | null = cond;
    while (current !== null) {
      if (current.trueStatements.length > 0) {
        branches.push(current.trueStatements);
      }
      if (current.falseStatements && current.falseStatements.length > 0) {
        if (
          current.falseStatements.length === 1 &&
          current.falseStatements[0].kind === "statement_condition"
        ) {
          // else if
          current = current.falseStatements[0];
        } else {
          // else
          branches.push(current.falseStatements);
          current = null;
        }
      } else {
        current = null;
      }
    }
    return branches;
  }

  private createWarning(loc: SrcInfo, dupLoc: SrcInfo): Warning {
    return this.makeWarning(
      "Duplicated code in conditional branches is detected",
      loc,
      {
        extraDescription: `Identical code block was detected at line ${dupLoc.interval.getLineAndColumn().lineNum}`,
        suggestion: "Consider refactoring to eliminate this duplication",
      },
    );
  }
}
