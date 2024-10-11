import { CompilationUnit } from "../../internals/ir";
import { foldStatements, foldExpressions, isSelf } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
  idText,
} from "@tact-lang/compiler/dist/grammar/ast";

export class SendInLoop extends ASTDetector {
  severity = Severity.HIGH;

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

  private analyzeStatement(
    stmt: AstStatement,
    processedLoopIds: Set<number>,
  ): MistiTactWarning[] {
    // Avoid processing the same loop multiple times
    if (processedLoopIds.has(stmt.id)) {
      return [];
    }
    if (this.isLoop(stmt)) {
      processedLoopIds.add(stmt.id);
    }
    return foldExpressions(
      stmt,
      (acc, expr) => {
        if (this.isSendCall(expr)) {
          acc.push(
            this.makeWarning("Send function called inside a loop", expr.loc, {
              suggestion:
                "Consider refactoring to avoid calling send functions inside loops.",
            }),
          );
        }
        return acc;
      },
      [] as MistiTactWarning[],
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