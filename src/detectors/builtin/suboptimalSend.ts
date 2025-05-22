import { CompilationUnit } from "../../internals/ir";
import { foldExpressions, isSelf } from "../../internals/tact";
import {
  AstExpression,
  AstStaticCall,
  AstStructInstance,
  idText,
  prettyPrint,
  SrcInfo,
} from "../../internals/tact/imports";
import { Category, Warning, Severity } from "../../internals/warnings";
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

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            this.findReplaceableSend(acc, expr);
            this.findReplaceableForward(acc, expr);
            return acc;
          },
          [] as Warning[],
        ),
      );
    }, [] as Warning[]);
  }

  private containsField(s: AstStructInstance, arg: string): boolean {
    return undefined !== s.args.find((a) => idText(a.field) === arg);
  }

  private hasCashbackMode(s: AstStructInstance): boolean {
    const bodyField = s.args.find((a) => idText(a.field) === "body");
    if (bodyField && !(bodyField.initializer.kind === "null")) {
      return false;
    }
    const bounceField = s.args.find((a) => idText(a.field) === "bounce");
    if (
      bounceField &&
      !(
        bounceField.initializer.kind === "boolean" &&
        bounceField.initializer.value === false
      )
    ) {
      return false;
    }
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

  /**
   * Find `send` calls that may have a more gas-efficient version.
   */
  private findReplaceableSend(acc: Warning[], expr: AstExpression): void {
    if (
      expr.kind !== "static_call" ||
      expr.args.length !== 1 ||
      expr.args[0].kind !== "struct_instance"
    ) {
      return;
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
  }

  private isSenderAccess(expr: AstExpression): boolean {
    return (
      (expr.kind === "static_call" &&
        expr.args.length === 0 &&
        idText(expr.function) === "sender") ||
      (expr.kind === "field_access" &&
        expr.aggregate.kind === "id" &&
        idText(expr.field) === "sender" &&
        // TODO: Replace the heuristics when we have types in AST:
        //       https://github.com/nowarp/misti/issues/136
        ["ctx", "context"].includes(idText(expr.aggregate).toLowerCase()))
    );
  }

  /**
   * Find `self.forward` calls that may have a more gas-efficient version.
   *
   * See:
   * * https://docs.tact-lang.org/ref/core-base/#self-reply
   * * https://docs.tact-lang.org/ref/core-base/#self-notify
   */
  private findReplaceableForward(acc: Warning[], expr: AstExpression): void {
    if (
      expr.kind == "method_call" &&
      expr.args.length == 4 &&
      idText(expr.method) === "forward" &&
      isSelf(expr.self) &&
      expr.args[3].kind === "null" &&
      expr.args[2].kind === "boolean" &&
      this.isSenderAccess(expr.args[0])
    ) {
      const replacement = expr.args[2].value ? "reply" : "notify";
      const warn = this.makeWarning(
        `Prefer \`self.${replacement}(${prettyPrint(expr.args[1])})\` over \`self.forward(...)\``,
        expr.loc,
        {
          suggestion: `Use more gas-efficient \`self.${replacement}\` function: https://docs.tact-lang.org/ref/core-base/#self-${replacement}`,
        },
      );
      acc.push(warn);
    }
  }

  private inspectSendCall(
    call: AstStaticCall,
    arg: AstStructInstance,
  ): Warning | undefined {
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
  ): Warning | undefined {
    if (this.hasCashbackMode(arg)) {
      return this.suggestReplace(call.loc, "message", "cashback");
    }
    return undefined;
  }

  private suggestReplace(loc: SrcInfo, from: string, to: string): Warning {
    const docsBase = "https://docs.tact-lang.org/ref/core-common";
    return this.makeWarning(`Prefer \`${to}\` over \`${from}\``, loc, {
      suggestion: `Use more gas-efficient \`${to}\` function: ${docsBase}/#${to}`,
    });
  }
}
