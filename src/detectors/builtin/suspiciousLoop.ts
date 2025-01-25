import { CompilationUnit } from "../../internals/ir";
import {
  foldStatements,
  foldExpressions,
  evalExpr,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 *
 * An optional detector that identifies potentially problematic loops, such as those
 * with unbounded conditions or excessive iteration counts.
 *
 * ## Why is it bad?
 * Loops with always-true conditions or massive iteration limits can lead to high
 * gas consumption and even denial of service (DoS) issues. By flagging these loops,
 * this detector aids auditors in catching potential performance or security risks.
 *
 * ## Example
 * ```tact
 * repeat (1_000_001) { // Highlighted by detector as high iteration count
 *     // ...
 * }
 *
 * while (true) { // Highlighted as unbounded condition
 *     // ...
 * }
 * ```
 */
export class SuspiciousLoop extends AstDetector {
  severity = Severity.HIGH;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const processedLoopIds = new Set<number>();
    return Array.from(cu.ast.getProgramEntries()).reduce((acc, node) => {
      return acc.concat(
        ...foldStatements(
          node,
          (acc, stmt) => {
            return acc.concat(
              this.analyzeLoopStatement(stmt, processedLoopIds),
            );
          },
          acc,
          { flatStmts: true },
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  /**
   * Analyzes a loop statement to determine if it contains a suspicious condition.
   * @param stmt - The statement to analyze.
   * @param processedLoopIds - A set of loop IDs already processed.
   * @returns An array of MistiTactWarning objects if a suspicious loop is detected.
   */
  private analyzeLoopStatement(
    stmt: AstStatement,
    processedLoopIds: Set<number>,
  ): MistiTactWarning[] {
    if (processedLoopIds.has(stmt.id)) {
      return [];
    }
    if (this.isLoop(stmt)) {
      processedLoopIds.add(stmt.id);
      return foldExpressions(
        stmt,
        (acc, expr) => {
          if (this.isSuspiciousCondition(expr, stmt)) {
            acc.push(
              this.makeWarning(
                "Potential unbounded or high-cost loop",
                stmt.loc,
                {
                  suggestion:
                    "Avoid excessive iterations or unbounded conditions in loops",
                },
              ),
            );
          }
          return acc;
        },
        [] as MistiTactWarning[],
      );
    }
    return [];
  }

  /**
   * Checks if an expression is a suspicious condition, indicating an unbounded
   * loop or excessive iteration.
   * @param expr - The expression to evaluate.
   * @param stmt - The statement to evaluate.
   * @returns True if the expression is suspicious, otherwise false.
   */
  private isSuspiciousCondition(
    expr: AstExpression,
    stmt: AstStatement,
  ): boolean {
    if (stmt.kind === "statement_foreach") {
      return false;
    }
    const result = evalExpr(expr);
    if (result === undefined) {
      return false;
    }
    if (stmt.kind === "statement_repeat") {
      const threshold = 100_000;
      return typeof result === "bigint" && result > BigInt(threshold);
    }
    if (stmt.kind === "statement_while" || stmt.kind === "statement_until") {
      return typeof result === "boolean" && result === true;
    }
    return false;
  }

  /**
   * Determines if a statement is a loop.
   * @param stmt - The statement to evaluate.
   * @returns True if the statement represents a loop, otherwise false.
   */
  private isLoop(stmt: AstStatement): boolean {
    return (
      stmt.kind === "statement_while" ||
      stmt.kind === "statement_repeat" ||
      stmt.kind === "statement_until" ||
      stmt.kind === "statement_foreach"
    );
  }
}
