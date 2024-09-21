import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tactASTUtil";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import { AstExpression } from "@tact-lang/compiler/dist/grammar/ast";

const REPLACEMENTS: Record<string, { replacement: string; rationale: string }> =
  {
    nativeSendMessage: {
      replacement: "send",
      rationale:
        "Prefer `send` to make the call more explicit and reduce low-level operations",
    },
    nativeRandom: {
      replacement: "randomInt",
      rationale:
        "Prefer `randomInt` since `nativeRandom` requires additional initialization of PRG before use",
    },
  };

/**
 * An optional detector that flags the use of advanced functions from the standard library.
 *
 * ## Why is it bad?
 * Auditors should pay extra attention to these functions, as incorrect usage can
 * lead to subtle bugs. Safer stdlib alternatives should be preferred in the code.
 *
 * Supported functions:
 * * Use `send` instead of [`nativeSendMessage`](https://docs.tact-lang.org/ref/core-advanced#nativesendmessage)
 * * Prefer `randomInt` instead of [`nativeRandom`](https://docs.tact-lang.org/ref/core-advanced#nativerandom)
 *
 * ## Example
 * ```tact
 * let pkg: Slice = msg.transfer;
 * let _seqno: Int = pkg.loadInt(32);
 * let mode: Int = pkg.loadInt(8);
 * let body: Cell = pkg.loadRef();
 * // Bad: prefer `send` to avoid low-level manipulation of Slice
 * nativeSendMessage(body, mode);
 * ```
 *
 * Use instead:
 * ```tact
 * // Safer: More explicit definition of the send operation
 * send(SendParameters{ value: amount,
 *                      to: self.owner,
 *                      mode: mode,
 *                      body: beginCell().endCell() });
 * ```
 */
export class PreferredStdlibApi extends ASTDetector {
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(node, [] as MistiTactWarning[], (acc, expr) => {
          return this.findDumpUsage(acc, expr);
        }),
      );
    }, [] as MistiTactWarning[]);
  }

  private findDumpUsage(
    acc: MistiTactWarning[],
    expr: AstExpression,
  ): MistiTactWarning[] {
    if (expr.kind === "static_call") {
      const funName = expr.function.text;
      const replacementInfo = REPLACEMENTS[funName] || undefined;
      if (replacementInfo !== undefined)
        acc.push(
          this.makeWarning(
            `Prefer ${replacementInfo.replacement}`,
            Severity.LOW,
            expr.loc,
            {
              extraDescription: replacementInfo.rationale,
              suggestion:
                "Consider replacing stdlib function with a safer alternative",
            },
          ),
        );
    }
    return acc;
  }
}
