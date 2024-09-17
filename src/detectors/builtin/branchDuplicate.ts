import { ASTDetector } from "../detector";
import { CompilationUnit } from "../../internals/ir";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { foldExpressions, foldStatements } from "../../internals/tactASTUtil";
import {
  AstExpression,
  AstStatement,
  AstCondition,
  SrcInfo,
} from "@tact-lang/compiler/dist/grammar/ast";
import { AstComparator } from "@tact-lang/compiler/dist/";

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
export class BranchDuplicate extends ASTDetector {
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      const ternaryWarnings = foldExpressions(
        node,
        [] as MistiTactWarning[],
        (acc, expr) => {
          return this.checkTernary(acc, expr);
        },
      );
      const conditionWarnings = foldStatements(
        node,
        [] as MistiTactWarning[],
        (acc, stmt) => {
          return this.checkConditional(acc, stmt);
        },
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
      this.nodesAreEqual(expr.thenBranch, expr.elseBranch)
    ) {
      acc.push(this.createWarning(expr.loc));
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
      const allConditions = this.collectAllConditions(stmt);
      if (this.hasDuplicateConditions(allConditions)) {
        acc.push(this.createWarning(stmt.loc));
      }
    }
    return acc;
  }

  /**
   * Collects the main condition and all elseif conditions into an array.
   */
  private collectAllConditions(stmt: AstCondition): AstCondition[] {
    const conditions: AstCondition[] = [];
    let current: AstCondition | null = stmt;
    while (current !== null) {
      conditions.push(current);
      current = current.elseif;
    }
    return conditions;
  }

  /**
   * Checks if any condition in the array has identical true and false branches.
   */
  private hasDuplicateConditions(conditions: AstCondition[]): boolean {
    return conditions.some((condition) =>
      condition.falseStatements === null
        ? false
        : this.statementsAreEqual(
            condition.trueStatements,
            condition.falseStatements || [],
          ),
    );
  }

  private nodesAreEqual(
    node1: AstExpression | AstStatement,
    node2: AstExpression | AstStatement,
  ): boolean {
    return AstComparator.make({ sort: true, canonicalize: false }).compare(
      node1,
      node2,
    );
  }

  private statementsAreEqual(
    stmts1: AstStatement[],
    stmts2: AstStatement[],
  ): boolean {
    if (stmts1.length !== stmts2.length) return false;
    return stmts1.every((stmt, i) => {
      return this.nodesAreEqual(stmt, stmts2[i]);
    });
  }

  private createWarning(loc: SrcInfo): MistiTactWarning {
    return this.makeWarning(
      "Duplicated code in conditional branches detected",
      Severity.HIGH,
      loc,
      {
        suggestion:
          "Identical code in both branches detected. Refactor to eliminate redundancy.",
      },
    );
  }
}
