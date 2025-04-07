import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tact";
import { AstExpression, AstMethodCall } from "../../internals/tact/imports";
import { unreachable } from "../../internals/util";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

enum ReplacementKind {
  SAFETY = 0,
  OPTIMIZATION,
}
function kindToString(k: ReplacementKind): string {
  switch (k) {
    case ReplacementKind.SAFETY:
      return "safer";
    case ReplacementKind.OPTIMIZATION:
      return "more gas-effective";
    default:
      unreachable(k);
  }
}
function kindToCategory(k: ReplacementKind): Category {
  switch (k) {
    case ReplacementKind.SAFETY:
      return Category.SECURITY;
    case ReplacementKind.OPTIMIZATION:
      return Category.OPTIMIZATION;
    default:
      unreachable(k);
  }
}

const REPLACEMENTS: Record<
  string,
  { replacement: string; kind: ReplacementKind; rationale: string }
> = {
  nativeSendMessage: {
    replacement: "send",
    kind: ReplacementKind.SAFETY,
    rationale:
      "Prefer `send` to make the call more explicit and reduce low-level operations",
  },
  nativeRandom: {
    replacement: "randomInt",
    kind: ReplacementKind.SAFETY,
    rationale:
      "Prefer `randomInt` since `nativeRandom` requires additional initialization of PRG before use",
  },
  require: {
    replacement: "throwUnless",
    kind: ReplacementKind.OPTIMIZATION,
    rationale:
      "`throwUnless` is preferred in production because it is more gas-efficient.",
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
 * * Replace `require` with `throwUnless`
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
  severity = Severity.INFO;
  category = [Category.OPTIMIZATION, Category.SECURITY];

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            return this.findStdlibUsage(acc, expr);
          },
          [] as Warning[],
        ),
      );
    }, [] as Warning[]);
  }

  private findStdlibUsage(acc: Warning[], expr: AstExpression): Warning[] {
    if (expr.kind === "static_call") {
      const funName = expr.function.text;
      const r = REPLACEMENTS[funName] || undefined;
      if (r !== undefined)
        acc.push(
          this.makeWarning(
            `${funName} has a ${kindToString(r.kind)} alternative: ${r.replacement}`,
            expr.loc,
            {
              category: kindToCategory(r.kind),
              extraDescription: r.rationale,
              suggestion: `${funName} should be replaced with a ${kindToString(r.kind)} alternative: ${r.replacement}`,
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
                category: Category.SECURITY,
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
