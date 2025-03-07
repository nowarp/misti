import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tact";
import { AstExpression, idText } from "../../internals/tact/imports";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that identifies instances where the `send` function is used,
 * which could be replaced with its more efficient alternative: `deploy`.
 *
 * ##  Why is it bad?
 * Using `send` to deploy contracts has been deprecated since Tact 1.6 because
 * it results in unnecessarily high gas consumption.
 *
 * ## Example
 * ```tact
 * let init = initOf SomeContract(p1, p2, p3);
 * send(SendParameters{
 *   to: contractAddress(init),
 *   code: init.code,
 *   data: init.data,
 *   value: 0,
 *   body: FooBar{}.asCell(),
 * });
 * ```
 *
 * Use instead:
 * ```tact
 * deploy(DeployParameters{
 *   init: initOf SomeContract(p1, p2, p3),
 *   value: 0,
 *   body: FooBar{}.asCell(),
 *});
 * ```
 */
export class PreferDeploy extends AstDetector {
  severity = Severity.INFO;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            return this.findReplacableSend(acc, expr);
          },
          [] as MistiTactWarning[],
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  private findReplacableSend(
    acc: MistiTactWarning[],
    expr: AstExpression,
  ): MistiTactWarning[] {
    if (
      expr.kind === "static_call" &&
      expr.function.text === "send" &&
      expr.args.length === 1 &&
      expr.args[0].kind === "struct_instance" &&
      idText(expr.args[0].type) === "SendParameters" &&
      expr.args[0].args.find((a) => idText(a.field) === "code")
    ) {
      acc.push(
        this.makeWarning("Prefer `deploy` over `send`", expr.loc, {
          suggestion: `Use more gas-effecient \`deploy\` function: https://docs.tact-lang.org/ref/core-common/#deploy`,
        }),
      );
    }
    return acc;
  }
}
