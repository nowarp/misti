import { CompilationUnit } from "../../internals/ir";
import {
  AstExpression,
  AstMethodCall,
  idText,
  isLiteral,
  prettyPrint,
} from "../../internals/tact/imports";
import { isSelfAccess, nodesAreEqual } from "../../internals/tact/util";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * Detects method calls where an argument is always the same constant or contract field,
 * suggesting removal of the redundant parameter for gas optimization.
 *
 * ## Why is this bad?
 * Passing the same value every damn time wastes gas and clutters the code.
 * If an argument is always `self.a` or a literal like `42`, just hardcode it inside the method.
 *
 * ## What it checks
 * - Arguments that are always the same contract field (`self.x`, `self.y`, etc.).
 * - Arguments that are always the same literal (e.g., `true`, `42`, `"fixed_string"`).
 *
 * ## Example
 *
 * ```tact
 * contract C {
 *   a: Int = 0;
 *   receive() { self.nextA(self.a); }
 *   receive("whatever") { self.nextA(self.a); }
 *   fun nextA(a: Int): Int {
 *     return a + 1; // Bad: `self.a` is always passed, so the parameter is useless
 *   }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract C {
 *   a: Int = 0;
 *   receive() { self.nextA(); }
 *   receive("whatever") { self.nextA(); }
 *   fun nextA(): Int {
 *     return self.a + 1; // OK: Use `self.a` directly
 *   }
 * }
 * ```
 */
export class UnusedMethodArgument extends AstDetector {
  severity = Severity.LOW;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    const warnings: Warning[] = [];
    cu.callGraph.getNodes().forEach((node) => {
      if (!node.loc || node.loc.origin !== "user") {
        return;
      }

      const callsites: AstMethodCall[] = [];
      for (const edgeId of node.inEdges) {
        const edge = cu.callGraph.getEdges().get(edgeId);
        if (edge && edge.call.kind === "method_call") {
          callsites.push(edge.call);
        }
      }
      if (callsites.length < 1) return;

      const firstCall = callsites[0];
      for (let argIndex = 0; argIndex < firstCall.args.length; argIndex++) {
        const firstArg = firstCall.args[argIndex];
        if (!this.isInterestingArg(firstArg)) continue;
        let allSame = true;
        for (let callIndex = 1; callIndex < callsites.length; callIndex++) {
          const currentCall = callsites[callIndex];
          if (currentCall.args.length <= argIndex) {
            allSame = false;
            break;
          }
          const currentArg = currentCall.args[argIndex];
          if (
            this.isInterestingArg(currentArg) &&
            !nodesAreEqual(firstArg, currentArg)
          ) {
            allSame = false;
            break;
          }
        }

        if (allSame) {
          const valueStr = prettyPrint(firstCall.args[argIndex]);
          warnings.push(
            this.makeWarning(
              `Method ${idText(firstCall.method)} always receives the same value ${valueStr} for argument #${argIndex + 1}`,
              node.loc,
              {
                suggestion: `Consider removing this parameter and using ${valueStr} directly inside the method.`,
              },
            ),
          );
        }
      }
    });
    return warnings;
  }

  /**
   * Checks if the detector should suggested replacing this argument.
   */
  private isInterestingArg(a: AstExpression): boolean {
    return a.loc.origin == "user" && (isSelfAccess(a) || isLiteral(a));
  }
}
