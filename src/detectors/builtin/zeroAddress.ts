import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import { AstExpression } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that identifies uses of the zero address.
 *
 * ## Why is it bad?
 * Using the zero address in smart contracts is typically problematic because it can be
 * exploited as a default or uninitialized address, leading to unintended transfers and
 * security vulnerabilities. Additionally, operations involving the zero address can
 * result in loss of funds or tokens, as there is no private key to access this address.
 *
 * ## Example
 * ```tact
 * contract Proxy {
 *   to: Address;
 *   init() {
 *     // Warning: Insecure usage of zero address as default value
 *     self.to = newAddress(0, 0);
 *   }
 *   fun setAddress(to: Address) {
 *     self.to = to
 *   }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Proxy {
 *   to: Address;
 *   init(to: Address) {
 *     // Fixed: Using the input value on initialization.
 *     self.to = to;
 *   }
 *   fun setAddress(to: Address) {
 *     self.to = to
 *   }
 * }
 * ```
 */
export class ZeroAddress extends ASTDetector {
  severity = Severity.LOW;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            return this.findZeroAddress(acc, expr);
          },
          [] as MistiTactWarning[],
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  private findZeroAddress(
    acc: MistiTactWarning[],
    expr: AstExpression,
  ): MistiTactWarning[] {
    if (expr.kind === "static_call") {
      if (
        expr.function.text === "newAddress" &&
        expr.args.length === 2 &&
        expr.args[1].kind === "number" &&
        expr.args[1].value === 0n
      ) {
        acc.push(
          this.makeWarning("Using zero address", expr.args[1].loc, {
            suggestion: [
              "Consider changing code to avoid using it.",
              "For example, you could pass the address during the deployment.",
            ].join(" "),
          }),
        );
      }
    }
    return acc;
  }
}
