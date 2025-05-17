import { CompilationUnit } from "../../internals/ir";
import { foldExpressions, isComparison } from "../../internals/tact";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * An optional detector that highlights all the constant addresses appearing in the source code.
 *
 * ## Why is it bad?
 * Using hardcoded addresses can sometimes indicate poor contract design.
 * Some constant addresses may need to be set dynamically, e.g., using
 * `contractAddress`, or at least have a way to change them at runtime, for
 * example, when upgrading a contract.
 *
 * ## Example
 * ```tact
 * contract Main {
 *   proxy: Address;
 *   init() {
 *     // Bad: Constant address highlighted by the analyzer.
 *     self.proxy = address("UQBKgXCNLPexWhs2L79kiARR1phGH1LwXxRbNsCFF9doczSI");
 *   }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Main {
 *   proxy: Address;
 *   init() {
 *    let proxy: Proxy = initOf Proxy(myAddress());
 *     // OK: Address depends on how the proxy contact has been deployed
 *     self.proxy = contractAddress(proxy);
 *   }
 * }
 * ```
 */
export class ConstantAddress extends AstDetector {
  severity = Severity.INFO;
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            if (expr.kind === "static_call") {
              if (
                expr.function.text === "address" &&
                expr.args.length === 1 &&
                expr.args[0].kind === "string"
              ) {
                acc.push(
                  this.makeWarning("Found constant address", expr.loc, {
                    extraDescription:
                      "Using hardcoded addresses can sometimes indicate poor contract design",
                  }),
                );
              }
            }
            return acc;
          },
          [] as Warning[],
          {
            shouldContinue: (expr) => {
              // Stop traversal if we're inside a comparison
              return !isComparison(expr);
            },
          },
        ),
      );
    }, [] as Warning[]);
  }
}
