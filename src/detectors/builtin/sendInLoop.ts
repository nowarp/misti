import { CompilationUnit } from "../../internals/ir";
import { CallGraph, CGNodeId } from "../../internals/ir/callGraph";
import {
  forEachStatement,
  foldExpressions,
  isSelf,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
  idText,
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
export class SendInLoop extends ASTDetector {
  severity = Severity.MEDIUM;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const processedLoopIds = new Set<number>();
    const allWarnings: MistiTactWarning[] = [];
    const astStore = cu.ast;
    const ctx = this.ctx;
    const callGraph = new CallGraph(ctx).build(astStore);
    const functionsCallingSend = new Set<CGNodeId>();

    // Identify all functions that contain a send call
    for (const func of astStore.getFunctions()) {
      let containsSend = false;
      foldExpressions(
        func,
        (acc, expr) => {
          if (this.isSendCall(expr)) {
            containsSend = true;
          }
          return acc;
        },
        null,
      );
      if (containsSend) {
        const funcNodeId = callGraph.getNodeIdByAstId(func.id);
        if (funcNodeId !== undefined) {
          functionsCallingSend.add(funcNodeId);
        }
      }
    }

    // Analyze loops and check if any function called within leads to a send
    for (const entry of cu.ast.getProgramEntries()) {
      if (entry.kind === "contract") {
        const contract = entry as AstContract;
        const contractName = contract.name.text;
        forEachStatement(entry, (stmt) => {
          const warnings = this.analyzeStatement(
            stmt,
            processedLoopIds,
            callGraph,
            functionsCallingSend,
            contractName,
          );
          allWarnings.push(...warnings);
        });
      } else {
        forEachStatement(entry, (stmt) => {
          const warnings = this.analyzeStatement(
            stmt,
            processedLoopIds,
            callGraph,
            functionsCallingSend,
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
    functionsCallingSend: Set<CGNodeId>,
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
                // Check if the callee is connected to any function that calls send
                for (const sendFuncNodeId of functionsCallingSend) {
                  if (callGraph.areConnected(calleeNodeId, sendFuncNodeId)) {
                    // Get the callee node to retrieve its name
                    const calleeNode = callGraph.getNode(calleeNodeId);
                    const calleeFunctionName = calleeNode?.name ?? calleeName;

                    acc.push(
                      this.makeWarning(
                        `Function "${calleeFunctionName}" called inside a loop leads to a send function`,
                        expr.loc,
                        {
                          suggestion:
                            "Consider refactoring to avoid calling send functions inside loops",
                        },
                      ),
                    );
                    break;
                  }
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
