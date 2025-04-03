import { CompilationUnit } from "../../internals/ir";
import {
  foldStatements,
  evalsToLiteral,
  evalsToPredicate,
  MakeLiteral,
} from "../../internals/tact";
import { AstStatement, AstExpression } from "../../internals/tact/imports";
import { Category, MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

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
 * repeat (10_001) { // Bad: High iteration count
 *     // ...
 * }
 *
 * while (true) { // Bad: Unbounded condition
 *     // ...
 * }
 * ```
 */
export class SuspiciousLoop extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return Array.from(cu.ast.getProgramEntries()).reduce((acc, node) => {
      return acc.concat(
        ...foldStatements(
          node,
          (acc, stmt) => {
            return acc.concat(this.analyzeLoopStatement(stmt));
          },
          acc,
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  /**
   * Analyzes a loop statement to determine if it contains a suspicious condition.
   */
  private analyzeLoopStatement(stmt: AstStatement): MistiTactWarning[] {
    if (
      stmt.kind === "statement_repeat" &&
      evalsToPredicate(
        stmt.iterations,
        (v) => v && "kind" in v && v.kind === "number" && v.value > 10_000n,
      )
    ) {
      return [
        this.makeWarning("Potential high-cost loop", stmt.iterations.loc, {
          suggestion: "Avoid excessive iterations in loops",
        }),
      ];
    }
    if (stmt.kind === "statement_while") {
      let warnings: MistiTactWarning[] = [];
      warnings = warnings.concat(this.checkTrueCondition(stmt.condition));
      if (warnings.length === 0 && stmt.statements.length > 0) {
        warnings = warnings.concat(this.checkFalseCondition(stmt.condition));
      }
      return warnings;
    }
    if (stmt.kind === "statement_until") {
      let warnings: MistiTactWarning[] = [];
      warnings = warnings.concat(this.checkTrueCondition(stmt.condition));
      return warnings;
    }
    return [];
  }

  private checkFalseCondition(expr: AstExpression): MistiTactWarning[] {
    if (evalsToLiteral(expr, MakeLiteral.boolean(false))) {
      return [
        this.makeWarning("Loop condition is always false", expr.loc, {
          suggestion:
            "The condition is always false; the body will never execute",
        }),
      ];
    }
    return [];
  }

  private checkTrueCondition(expr: AstExpression): MistiTactWarning[] {
    return evalsToLiteral(expr, MakeLiteral.boolean(true))
      ? [
          this.makeWarning("Infinite loop detected", expr.loc, {
            suggestion: "Avoid unbounded conditions in loops",
          }),
        ]
      : [];
  }
}
