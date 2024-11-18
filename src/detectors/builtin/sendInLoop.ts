import { CompilationUnit } from "../../internals/ir";
import { CallGraph } from "../../internals/ir/callGraph";
import { CGNodeId } from "../../internals/ir/callGraph"; // Import CGNodeId type
import {
  forEachStatement,
  foldExpressions,
  isSelf,
  forEachExpression,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
  idText,
  AstFunctionDef,
  AstReceiver,
  AstContractInit,
  AstStaticCall,
  AstMethodCall,
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
    const callGraph = new CallGraph(this.ctx);
    callGraph.build(cu.ast);
    const nodeNameToIdMap = new Map<string, CGNodeId>();
    for (const [nodeId, node] of callGraph.getNodes()) {
      nodeNameToIdMap.set(node.name, nodeId);
    }

    // Identify all functions that directly call send functions
    const functionsThatCallSend = new Set<CGNodeId>();
    for (const node of cu.ast.getProgramEntries()) {
      if (
        node.kind === "function_def" ||
        node.kind === "receiver" ||
        node.kind === "contract_init"
      ) {
        const func = node as AstFunctionDef | AstReceiver | AstContractInit;
        let callsSend = false;
        forEachExpression(func, (expr) => {
          if (this.isSendCall(expr)) {
            callsSend = true;
          }
        });
        if (callsSend) {
          const functionName = this.getFunctionName(func);
          if (functionName) {
            const nodeId = nodeNameToIdMap.get(functionName);
            if (nodeId !== undefined) {
              functionsThatCallSend.add(nodeId);
            }
          }
        }
      }
    }

    // Analyze the AST to find loops and check for function calls inside loops
    for (const node of cu.ast.getProgramEntries()) {
      forEachStatement(node, (stmt) => {
        const warnings = this.analyzeStatement(
          stmt,
          processedLoopIds,
          functionsThatCallSend,
          nodeNameToIdMap,
          callGraph,
        );
        allWarnings.push(...warnings);
      });
    }

    return allWarnings;
  }

  private analyzeStatement(
    stmt: AstStatement,
    processedLoopIds: Set<number>,
    functionsThatCallSend: Set<CGNodeId>,
    nodeNameToIdMap: Map<string, CGNodeId>,
    callGraph: CallGraph,
  ): MistiTactWarning[] {
    if (processedLoopIds.has(stmt.id)) {
      return [];
    }
    if (this.isLoop(stmt)) {
      processedLoopIds.add(stmt.id);
      const warnings: MistiTactWarning[] = [];
      foldExpressions(
        stmt,
        (acc, expr) => {
          if (this.isSendCall(expr)) {
            acc.push(
              this.makeWarning("Send function called inside a loop", expr.loc, {
                suggestion:
                  "Consider refactoring to avoid calling send functions inside loops",
              }),
            );
          } else if (
            expr.kind === "static_call" ||
            expr.kind === "method_call"
          ) {
            // It's a function call
            const functionName =
              expr.kind === "static_call"
                ? idText((expr as AstStaticCall).function)
                : idText((expr as AstMethodCall).method);
            // Node ID from the mapping
            const nodeId = nodeNameToIdMap.get(functionName);
            if (nodeId !== undefined) {
              // Check if this function can reach any function that calls send
              for (const sendFuncId of functionsThatCallSend) {
                if (callGraph.areConnected(nodeId, sendFuncId)) {
                  acc.push(
                    this.makeWarning(
                      `Function "${functionName}" called inside a loop may eventually call a send function`,
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

  private getFunctionName(
    func: AstFunctionDef | AstReceiver | AstContractInit,
  ): string | undefined {
    switch (func.kind) {
      case "function_def":
        return func.name?.text;
      case "contract_init":
        return `contract_init_${func.id}`;
      case "receiver":
        return `receiver_${func.id}`;
      default:
        return undefined;
    }
  }
}
