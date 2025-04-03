import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tact";
import {
  AstExpression,
  AstStaticCall,
  AstStructInstance,
  idText,
  SrcInfo,
} from "../../internals/tact/imports";
import { Category, MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that identifies suboptimal message passing functions that could
 * be replaced with more gas-effective alternatives.
 *
 * Tact 1.6 introduced more gas-effective alternatives to `send` that might
 * decrease gas consumption when used properly:
 * * [`message`](https://docs.tact-lang.org/ref/core-common/#message): a regular non-deployment message
 * * [`deploy`](https://docs.tact-lang.org/ref/core-common/#deploy): an effective contract deployment function
 * * [`cashback`](https://docs.tact-lang.org/ref/core-common/#cashback): more efficient way to send the remaining balance
 *
 * ## Why is it bad?
 * Using suboptimal send functions might lead to out-of-gas attacks, especially
 * when using at hot points.
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
export class SuboptimalSend extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            return this.findReplaceableSend(acc, expr);
          },
          [] as MistiTactWarning[],
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  private containsField(s: AstStructInstance, arg: string): boolean {
    return undefined !== s.args.find((a) => idText(a.field) === arg);
  }

  private hasCashbackMode(s: AstStructInstance): boolean {
    const modeField = s.args.find((a) => idText(a.field) === "mode");
    return (
      modeField !== undefined &&
      modeField.initializer.kind === "op_binary" &&
      ["|", "+"].includes(modeField.initializer.op) &&
      modeField.initializer.left.kind === "id" &&
      modeField.initializer.right.kind === "id" &&
      // TODO: Handle numeric values of SendRemainingValue/SendIgnoreErrors
      ["SendRemainingValue", "SendIgnoreErrors"].includes(
        idText(modeField.initializer.left),
      ) &&
      ["SendRemainingValue", "SendIgnoreErrors"].includes(
        idText(modeField.initializer.right),
      )
    );
  }

  private findReplaceableSend(
    acc: MistiTactWarning[],
    expr: AstExpression,
  ): MistiTactWarning[] {
    if (
      expr.kind !== "static_call" ||
      expr.args.length !== 1 ||
      expr.args[0].kind !== "struct_instance"
    ) {
      return acc;
    }
    const arg = expr.args[0];
    if (
      expr.function.text === "send" &&
      idText(arg.type) === "SendParameters"
    ) {
      const w = this.inspectSendCall(expr, arg);
      if (w) acc.push(w);
    } else if (
      expr.function.text === "message" &&
      idText(arg.type) === "MessageParameters"
    ) {
      const w = this.inspectMessageCall(expr, arg);
      if (w) acc.push(w);
    }
    return acc;
  }

  private inspectSendCall(
    call: AstStaticCall,
    arg: AstStructInstance,
  ): MistiTactWarning | undefined {
    if (this.containsField(arg, "code")) {
      return this.suggestReplace(call.loc, "send", "deploy");
    } else if (!this.containsField(arg, "data")) {
      // no `code` and `data`
      return this.suggestReplace(call.loc, "send", "message");
    }
    if (this.hasCashbackMode(arg)) {
      return this.suggestReplace(call.loc, "send", "cashback");
    }
    return undefined;
  }

  private inspectMessageCall(
    call: AstStaticCall,
    arg: AstStructInstance,
  ): MistiTactWarning | undefined {
    if (this.hasCashbackMode(arg)) {
      return this.suggestReplace(call.loc, "message", "cashback");
    }
    return undefined;
  }

  private suggestReplace(
    loc: SrcInfo,
    from: string,
    to: string,
  ): MistiTactWarning {
    const docsBase = "https://docs.tact-lang.org/ref/core-common";
    return this.makeWarning(`Prefer \`${to}\` over \`${from}\``, loc, {
      suggestion: `Use more gas-efficient \`${to}\` function: ${docsBase}/#${to}`,
    });
  }
}
