import { CompilationUnit } from "../../internals/ir";
import { foldStatements, foldExpressions, isSelf } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
  idText,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * An optional detector that identifies send functions being called inside loops.
 *
 * ## Why is it bad?
 * Calling send functions inside loops can lead to unintended consequences, such as
 * excessive message sending, increased gas consumption, and potential race conditions.
 * Loops with send calls should be refactored to avoid these issues. This detector helps
 * flag such code, prompting the developer to reconsider the design.
 *
 * ## Example
 * ```tact
 * fun exampleWhileLoop(limit: Int) {
 *   let i = 0;
 *   while (i < limit) {
 *       send(SendParameters{
 *           to: self.owner,
 *           value: 0,
 *           bounce: false,
 *           body: Msg{ a: i }.toCell()
 *       });
 *       i += 1;
 *   }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * fun refactorExample(limit: Int) {
 *   let i = 0;
 *   let messages: list<Msg> = [];
 *   while (i < limit) {
 *       messages.push(Msg{ a: i });
 *       i += 1;
 *   }
 *   for (msg in messages) {
 *       send(SendParameters{
 *           to: self.owner,
 *           value: 0,
 *           bounce: false,
 *           body: msg.toCell()
 *       });
 *   }
 * }
 * ```
 * // OK: The loop was refactored to collect messages first, then send them outside the loop.
 */
export class SendInLoop extends ASTDetector {
  severity = Severity.MEDIUM;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const processedLoopIds = new Set<number>();
    return Array.from(cu.ast.getProgramEntries()).reduce((acc, node) => {
      return acc.concat(
        ...foldStatements(
          node,
          (acc, stmt) => {
            return acc.concat(this.analyzeStatement(stmt, processedLoopIds));
          },
          acc,
          { flatStmts: true },
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  private analyzeStatement(
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
          if (this.isSendCall(expr)) {
            acc.push(
              this.makeWarning("Send function called inside a loop", expr.loc, {
                suggestion:
                  "Consider refactoring to avoid calling send functions inside loops",
              }),
            );
          }
          return acc;
        },
        [] as MistiTactWarning[],
      );
    }
    // If the statement is not a loop, don't flag anything
    return [];
  }

  private isSendCall(expr: AstExpression): boolean {
    const staticSendFunctions = ["send", "nativeSendMessage"];
    const selfMethodSendFunctions = ["reply", "forward", "notify", "emit"];
    return (
      (expr.kind === "static_call" &&
        staticSendFunctions.includes(idText(expr.function))) ||
      (expr.kind === "method_call" &&
        isSelf(expr.self) &&
        selfMethodSendFunctions.includes(idText(expr.method)))
    );
  }

  private isLoop(stmt: AstStatement): boolean {
    return (
      stmt.kind === "statement_while" ||
      stmt.kind === "statement_repeat" ||
      stmt.kind === "statement_until" ||
      stmt.kind === "statement_foreach"
    );
  }
}
