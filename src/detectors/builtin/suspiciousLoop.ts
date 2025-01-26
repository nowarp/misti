import { CompilationUnit } from "../../internals/ir";
import { foldStatements, evalExpr } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
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
    processedLoopIds.add(stmt.id);
    if (stmt.kind === "statement_foreach") {
      return [];
    }
    if (stmt.kind === "statement_repeat") {
      return this.isBig(stmt.iterations);
    }
    if (stmt.kind === "statement_while" || stmt.kind === "statement_until") {
      return this.isTrue(stmt.condition);
    }
    return [];
  }

  /**
   * Checks if an integer expression evaluates to a large number.
   */
  private isBig(expr: AstExpression): MistiTactWarning[] {
    const result = evalExpr(expr);
    if (result !== undefined && typeof result === "bigint") {
      const threshold = 1_000_000;
      if (result > BigInt(threshold)) {
        return [
          this.makeWarning("Potential high-cost loop", expr.loc, {
            suggestion: "Avoid excessive iterations in loops",
          }),
        ];
      }
    }
    return [];
  }

  /**
   * Checks if a boolean expression evaluates to false or true (infinite loop).
   */
  private isTrue(expr: AstExpression): MistiTactWarning[] {
    const result = evalExpr(expr);
    if (result !== undefined && typeof result === "boolean") {
      if (result === false) {
        return [
          this.makeWarning("Loop condition is always false", expr.loc, {
            suggestion: "Consider removing the loop if there is no logic error",
          }),
        ];
      }
      if (result === true) {
        return [
          this.makeWarning("Potential infinite loop", expr.loc, {
            suggestion: "Avoid unbounded conditions in loops",
          }),
        ];
      }
    }
    return [];
  }
}
