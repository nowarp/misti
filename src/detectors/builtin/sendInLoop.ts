import { CompilationUnit } from "../../internals/ir";
import { CallGraph, Effect } from "../../internals/ir/callGraph";
import { forEachStatement, foldExpressions } from "../../internals/tact";
import {
  AstStatement,
  AstExpression,
  AstContract,
  SrcInfo,
} from "../../internals/tact/imports";
import { isSendCall, getExtendsSelfType } from "../../internals/tact/util";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

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
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    const processedLoopIds = new Set<number>();
    const allWarnings: Warning[] = [];

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
            entry.kind === "function_def"
              ? getExtendsSelfType(entry)
              : undefined,
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
  ): Warning[] {
    if (processedLoopIds.has(stmt.id)) {
      return [];
    }
    processedLoopIds.add(stmt.id);
    if (!this.isLoop(stmt)) {
      return [];
    }

    const warnings: Warning[] = [];

    // Check direct send calls within the loop
    foldExpressions(
      stmt,
      (acc: Warning[], expr: AstExpression) => {
        if (isSendCall(expr)) {
          acc.push(this.warn("Send function called inside a loop", expr.loc));
        }
        return acc;
      },
      warnings,
    );

    // Check function calls within the loop that lead to a send
    foldExpressions(
      stmt,
      (acc: Warning[], expr: AstExpression) => {
        if (expr.kind === "static_call" || expr.kind === "method_call") {
          const calleeName = CallGraph.getFunctionCallName(
            expr,
            currentContractName,
          );
          if (calleeName === undefined) {
            return acc; // irrelevant, e.g. self.<map_field>.set()
          }
          const calleeNodeId = callGraph.getNodeIdByName(calleeName);
          if (calleeNodeId !== undefined) {
            const calleeNode = callGraph.getNode(calleeNodeId);
            if (calleeNode && calleeNode.hasEffect(Effect.Send)) {
              const isMethod = calleeNode.name.includes("::");
              const functionName = isMethod
                ? calleeNode.name.split("::").pop()
                : calleeNode.name;
              acc.push(
                this.warn(
                  `${isMethod ? "Method" : "Function"} "${functionName}" called inside a loop leads to calling a send function`,
                  expr.loc,
                ),
              );
            }
          } else {
            const lc = expr.loc.interval.getLineAndColumn() as {
              lineNum: number;
              colNum: number;
            };
            this.ctx.logger.error(
              `Cannot retrieve CG node: ${calleeName} (${lc.lineNum}:${lc.colNum})`,
            );
            return acc;
          }
        }
        return acc;
      },
      warnings,
    );
    return warnings;
  }

  private warn(msg: string, loc: SrcInfo): Warning {
    return this.makeWarning(msg, loc, {
      suggestion:
        "Consider refactoring to avoid calling send functions inside loops",
    });
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
