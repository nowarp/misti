import { CompilationUnit } from "../../internals/ir";
import {
  foldExpressions,
  foldStatements,
  nodesAreEqual,
  statementsAreEqual,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import {
  AstCondition,
  AstExpression,
  AstStatement,
  SrcInfo,
} from "@tact-lang/compiler/dist/grammar/ast";

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

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      const ternaryWarnings = foldExpressions(
        node,
        (acc, expr) => {
          return this.checkTernary(acc, expr);
        },
        [] as MistiTactWarning[],
      );
      const conditionWarnings = foldStatements(
        node,
        (acc, stmt) => {
          return this.checkConditional(acc, stmt);
        },
        [] as MistiTactWarning[],
      );
      return acc.concat([...conditionWarnings, ...ternaryWarnings]);
    }, [] as MistiTactWarning[]);
  }

  /**
   * Looks for duplicates in ternary expressions.
   */
  private checkTernary(
    acc: MistiTactWarning[],
    expr: AstExpression,
  ): MistiTactWarning[] {
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
  private checkConditional(
    acc: MistiTactWarning[],
    stmt: AstStatement,
  ): MistiTactWarning[] {
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

  private collectAllBranches(cond: AstCondition): AstStatement[][] {
    const branches: AstStatement[][] = [];
    let current: AstCondition | null = cond;
    while (current !== null) {
      if (current.trueStatements.length > 0) {
        branches.push(current.trueStatements);
      }
      if (
        current.falseStatements !== null &&
        current.falseStatements.length > 0
      ) {
        branches.push(current.falseStatements);
      }
      current = current.elseif;
    }
    return branches;
  }

  private createWarning(loc: SrcInfo, dupLoc: SrcInfo): MistiTactWarning {
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
