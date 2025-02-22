import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import {
  AstExpression,
  AstMethodCall,
} from "@tact-lang/compiler/dist/grammar/ast";

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

const METHOD_CHAINS: Array<{
  pattern: string[];
  replacement: string;
  rationale: string;
}> = [
  {
    pattern: ["emptyCell", "asSlice"],
    replacement: "emptySlice()",
    rationale: "Use `emptySlice()` instead of chaining `emptyCell().asSlice()`",
  },
  {
    pattern: ["beginCell", "endCell"],
    replacement: "emptyCell()",
    rationale: "Use `emptyCell()` instead of chaining `beginCell().endCell()`",
  },
];

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
 * * Replace `emptyCell().asSlice()` with `emptySlice()`
 * * Replace `beginCell().endCell()` with `emptyCell()`
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
export class PreferredStdlibApi extends AstDetector {
  minSeverity = Severity.INFO;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            return this.findStdlibUsage(acc, expr);
          },
          [] as MistiTactWarning[],
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  private findStdlibUsage(
    acc: MistiTactWarning[],
    expr: AstExpression,
  ): MistiTactWarning[] {
    if (expr.kind === "static_call") {
      const funName = expr.function.text;
      const replacementInfo = REPLACEMENTS[funName] || undefined;
      if (replacementInfo !== undefined)
        acc.push(
          this.makeWarning(
            `${funName} has a safer alternative: ${replacementInfo.replacement}`,
            expr.loc,
            {
              extraDescription: replacementInfo.rationale,
              suggestion: `${funName} should be replaced with a safer alternative: ${replacementInfo.replacement}`,
            },
          ),
        );
    } else if (expr.kind === "method_call") {
      // Check for method chains
      let current: AstExpression = expr;
      const chain: string[] = [];

      // Build the method chain
      while (current.kind === "method_call") {
        chain.unshift(current.method.text);
        const nextExpr: AstExpression = (current as AstMethodCall).self;
        current = nextExpr;

        if (current.kind === "static_call") {
          chain.unshift(current.function.text);
          break;
        }
      }

      // Check if the chain matches any patterns
      for (const pattern of METHOD_CHAINS) {
        if (arraysEqual(chain, pattern.pattern)) {
          acc.push(
            this.makeWarning(
              `Method chain has a safer alternative: ${pattern.replacement}`,
              expr.loc,
              {
                extraDescription: pattern.rationale,
                suggestion: `This chain should be replaced with: ${pattern.replacement}`,
              },
            ),
          );
          break;
        }
      }
    }
    return acc;
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, idx) => val === b[idx]);
}
