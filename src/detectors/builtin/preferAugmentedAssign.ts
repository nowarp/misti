import { CompilationUnit } from "../../internals/ir";
import { foldStatements } from "../../internals/tact";
import {
  AstExpression,
  AstStatement,
  prettyPrint,
  tryExtractPath,
} from "../../internals/tact/imports";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

const AstAugmentedAssignOperations = new Set<string>([
  "+",
  "-",
  "*",
  "/",
  "%",
  "|",
  "&",
  "^",
]);

/**
 * If the left-hand side (lhs) or right-hand side (rhs) of the binary expression
 * in assignment expressions has any of these kinds, the detector won't suggest
 * replacing it with an augmented assignment to improve readability.
 */
const DontSuggestKinds = new Set<string>([
  "conditional",
  "init_of",
  "struct_instance",
  "op_unary",
  "op_binary",
]);

/**
 * Detects non-idiomatic statements that can be written using augmented assignment
 * operators like `+=`, `-=`, etc.
 *
 * ## Why is it bad?
 * Using augmented assignment operations improves the readability of the source code
 * and reduces the risk of mistakes, such as those that occur during copy-pasting
 * and refactoring code.
 *
 * ## Example
 * ```tact
 * msgValue = (msgValue - ctx.readForwardFee());
 * ```
 *
 * Use instead:
 * ```tact
 * msgValue -= ctx.readForwardFee());
 * ```
 */
export class PreferAugmentedAssign extends AstDetector {
  severity = Severity.INFO;
  category = Category.BEST_PRACTICES;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldStatements(
          node,
          (acc, expr) => {
            return this.findAugmentedAssignReplacements(acc, expr);
          },
          [] as Warning[],
        ),
      );
    }, [] as Warning[]);
  }

  /**
   * Looks for assignment statements with a binary operation in rhs that could be
   * replaced with the augmented assignment.
   */
  private findAugmentedAssignReplacements(
    acc: Warning[],
    stmt: AstStatement,
  ): Warning[] {
    if (
      stmt.kind === "statement_assign" &&
      stmt.expression.kind === "op_binary" &&
      (this.pathsAreEqual(stmt.path, stmt.expression.left) ||
        this.pathsAreEqual(stmt.path, stmt.expression.right)) &&
      AstAugmentedAssignOperations.has(stmt.expression.op) &&
      !DontSuggestKinds.has(stmt.expression.left.kind) &&
      !DontSuggestKinds.has(stmt.expression.right.kind)
    ) {
      const suggestedRhs = this.pathsAreEqual(stmt.path, stmt.expression.left)
        ? prettyPrint(stmt.expression.right)
        : prettyPrint(stmt.expression.left);
      const suggestedChange = `${prettyPrint(stmt.path)} ${stmt.expression.op}= ${suggestedRhs}`;
      acc.push(
        this.makeWarning(
          `Prefer augmented assignment: ${suggestedChange}`,
          stmt.loc,
          {
            suggestion: `Consider using augmented assignment instead: ${suggestedChange}`,
          },
        ),
      );
    }
    return acc;
  }

  private pathsAreEqual(expr1: AstExpression, expr2: AstExpression): boolean {
    const path1 = tryExtractPath(expr1);
    if (path1 === null) {
      return false;
    }
    const path2 = tryExtractPath(expr2);
    if (path2 === null) {
      return false;
    }
    return path1.every(
      (p1) => path2.find((p2) => p2.text === p1.text) !== undefined,
    );
  }
}
