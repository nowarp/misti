import { CompilationUnit } from "../../internals/ir";
import { CallGraph, CGNodeId } from "../../internals/ir/callGraph";
import {
  forEachStatement,
  foldExpressions,
  isSelf,
} from "../../internals/tact";
import { unreachable } from "../../internals/util";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
  idText,
  AstFunctionDef,
  AstReceiver,
  AstContractInit,
  AstNode,
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
    const astIdToCGNodeId = new Map<number, CGNodeId>();
    for (const [nodeId, node] of callGraph.getNodes()) {
      if (node.astId !== undefined) {
        astIdToCGNodeId.set(node.astId, nodeId);
      }
    }

    // Collect functions that directly call send functions
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
        const funcName = this.getFunctionName(func);
        if (funcName) {
          const nodeId = callGraph.getNodeIdByName(funcName);
          if (nodeId !== undefined) {
            functionsCallingSend.add(nodeId);
          }
        }
      }
    }

    // Identify all functions that can lead to a send call
    const functionsLeadingToSend = this.getFunctionsLeadingToSend(
      callGraph,
      functionsCallingSend,
    );

    // Analyze loops and check if any function called within leads to a send
    Array.from(cu.ast.getProgramEntries()).forEach((node) => {
      forEachStatement(node, (stmt) => {
        const warnings = this.analyzeStatement(
          stmt,
          processedLoopIds,
          callGraph,
          astIdToCGNodeId,
          functionsLeadingToSend,
        );
        allWarnings.push(...warnings);
      });
    });

    return allWarnings;
  }

  private analyzeStatement(
    stmt: AstStatement,
    processedLoopIds: Set<number>,
    callGraph: CallGraph,
    astIdToCGNodeId: Map<number, CGNodeId>,
    functionsLeadingToSend: Set<CGNodeId>,
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

      // Check function calls within the loop that lead to send
      this.forEachExpression(stmt, (expr: AstExpression) => {
        if (expr.kind === "static_call" || expr.kind === "method_call") {
          const calleeName = this.getCalleeName(expr);
          if (calleeName) {
            const calleeNodeId = callGraph.getNodeIdByName(calleeName);
            if (
              calleeNodeId !== undefined &&
              functionsLeadingToSend.has(calleeNodeId)
            ) {
              warnings.push(
                this.makeWarning(
                  `Function "${calleeName}" called inside a loop leads to a send function`,
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
      });

      return warnings;
    }
    // If the statement is not a loop, don't flag anything
    return [];
  }

  private getFunctionsLeadingToSend(
    callGraph: CallGraph,
    functionsCallingSend: Set<CGNodeId>,
  ): Set<CGNodeId> {
    const functionsLeadingToSend = new Set<CGNodeId>(functionsCallingSend);

    // Use a queue for BFS
    const queue: CGNodeId[] = Array.from(functionsCallingSend);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentNode = callGraph.getNode(current);
      if (currentNode) {
        for (const edgeId of currentNode.inEdges) {
          const edge = callGraph.getEdge(edgeId);
          if (edge) {
            const callerId = edge.src;
            if (!functionsLeadingToSend.has(callerId)) {
              functionsLeadingToSend.add(callerId);
              queue.push(callerId);
            }
          }
        }
      }
    }

    return functionsLeadingToSend;
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
        unreachable(func);
    }
  }

  private getCalleeName(expr: AstExpression): string | undefined {
    if (expr.kind === "static_call") {
      return idText(expr.function);
    } else if (expr.kind === "method_call") {
      return idText(expr.method);
    }
    return undefined;
  }

  // Helper method to traverse expressions
  private forEachExpression(
    node: AstNode,
    callback: (expr: AstExpression) => void,
  ): void {
    foldExpressions(
      node,
      (acc, expr) => {
        callback(expr);
        return acc;
      },
      null,
    );
  }
}
