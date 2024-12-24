import { CompilationUnit } from "../../internals/ir";
import { CallGraph, Effect } from "../../internals/ir/callGraph";
import { forEachStatement, foldExpressions } from "../../internals/tact";
import { isSendCall } from "../../internals/tact/util";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
  AstStaticCall,
  AstMethodCall,
  AstContract,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * An optional detector that identifies send functions being called inside loops,
 * including indirect calls via other functions.
 *
 * ## Why is it bad?
 * Calling send functions inside loops can lead to unintended consequences, such as
 * excessive message sending, increased gas consumption, and potential race conditions.
 * Loops with send calls should be refactored to avoid these issues. This detector helps
 * flag such code, prompting the developer to reconsider the design.
 *
 * ## Example
 * ```tact
 * fun exampleWhileLoop(limit: Int, owner: Address) {
 *   let i = 0;
 *   while (i < limit) {
 *       send(SendParameters{ // Highlighted: An auditor should review the loop
 *           to: owner,
 *           value: 0,
 *           bounce: false,
 *           body: Msg{ a: i }.toCell()
 *       });
 *       i += 1;
 *   }
 * }
 * ```
 */
export class SendInLoop extends AstDetector {
  severity = Severity.MEDIUM;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const processedLoopIds = new Set<number>();
    const allWarnings: MistiTactWarning[] = [];

    // Analyze loops and check if any function called within leads to a send
    for (const entry of cu.ast.getProgramEntries()) {
      if (entry.kind === "contract") {
        const contract = entry as AstContract;
        const contractName = contract.name.text;
        forEachStatement(entry, (stmt) => {
          const warnings = this.analyzeStatement(
            stmt,
            processedLoopIds,
            cu.callGraph,
            contractName,
          );
          allWarnings.push(...warnings);
        });
      } else {
        forEachStatement(entry, (stmt) => {
          const warnings = this.analyzeStatement(
            stmt,
            processedLoopIds,
            cu.callGraph,
          );
          allWarnings.push(...warnings);
        });
      }
    }
    return allWarnings;
  }

  private analyzeStatement(
    stmt: AstStatement,
    processedLoopIds: Set<number>,
    callGraph: CallGraph,
    currentContractName?: string,
  ): MistiTactWarning[] {
    if (processedLoopIds.has(stmt.id)) {
      return [];
    }
    if (this.isLoop(stmt)) {
      processedLoopIds.add(stmt.id);

      const warnings: MistiTactWarning[] = [];

      // Check direct send calls within the loop
      foldExpressions(
        stmt,
        (acc: MistiTactWarning[], expr: AstExpression) => {
          if (isSendCall(expr)) {
            acc.push(
              this.makeWarning("Send function called inside a loop", expr.loc, {
                suggestion:
                  "Consider refactoring to avoid calling send functions inside loops",
              }),
            );
          }
          return acc;
        },
        warnings,
      );

      // Check function calls within the loop that lead to a send
      foldExpressions(
        stmt,
        (acc: MistiTactWarning[], expr: AstExpression) => {
          if (expr.kind === "static_call" || expr.kind === "method_call") {
            const calleeName = callGraph.getFunctionCallName(
              expr as AstStaticCall | AstMethodCall,
              currentContractName,
            );
            if (calleeName) {
              const calleeNodeId = callGraph.getNodeIdByName(calleeName);
              if (calleeNodeId !== undefined) {
                const calleeNode = callGraph.getNode(calleeNodeId);
                if (calleeNode && calleeNode.hasEffect(Effect.Send)) {
                  const functionName = calleeNode.name.includes("::")
                    ? calleeNode.name.split("::").pop()
                    : calleeNode.name;
                  acc.push(
                    this.makeWarning(
                      `Method "${functionName}" called inside a loop leads to a send function`,
                      expr.loc,
                      {
                        suggestion:
                          "Consider refactoring to avoid calling send functions inside loops",
                      },
                    ),
                  );
                }
              }
            }
          }
          return acc;
        },
        warnings,
      );
      return warnings;
    }
    // If the statement is not a loop, don't flag anything
    return [];
  }

  private isSendCall(expr: AstExpression): boolean {
    const staticSendFunctions = ["send", "nativeSendMessage"];
    const selfMethodSendFunctions = ["reply", "forward", "notify", "emit"];
    return (
      (expr.kind === "static_call" &&
        staticSendFunctions.includes(expr.function?.text || "")) ||
      (expr.kind === "method_call" &&
        expr.self.kind === "id" &&
        (expr.self as any).text === "self" &&
        selfMethodSendFunctions.includes(expr.method?.text || ""))
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
