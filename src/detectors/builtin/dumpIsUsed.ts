import { CompilationUnit } from "../../internals/ir";
import { foldExpressions, isPrimitiveLiteral } from "../../internals/tact";
import { AstExpression } from "../../internals/tact/imports";
import { Category, MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * An optional detector that highlights all the `dump` debug prints.
 *
 * ## Why is it bad?
 * The `dump` function is a debug print that shouldn't be in the final code.
 * Even though the compiler removes it in production, its presence suggests the
 * developer was debugging something. This can flag areas where issues might exist,
 * so auditors should take a closer look at these parts of the code.
 *
 * ## Example
 * ```tact
 * fun test(): Int {
 *   // ... other computations
 *   let combined: Int = (RANDOM_SEED >> half_shift) &
 *                       (MAGIC_CONSTANT << DIVIDE_BY_TWO) ^ shift_mask;
 *   dump(combined); // Suspicious: Highlighted by the detector
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * fun test(): Int {
 *   // ... other computations
 *   let combined: Int = this.seed ^ shift_mask
 *   // OK: The code was reviewed and simplified; `dump` was removed
 * }
 * ```
 */
export class DumpIsUsed extends AstDetector {
  severity = Severity.INFO;
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            return this.findDumpUsage(acc, expr);
          },
          [] as MistiTactWarning[],
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  private findDumpUsage(
    acc: MistiTactWarning[],
    expr: AstExpression,
  ): MistiTactWarning[] {
    if (
      expr.kind === "static_call" &&
      expr.function.text === "dump" &&
      // Sort out calls with literal arguments: `dump("myFun")` or `dump(42)`
      !(expr.args.length === 1 && isPrimitiveLiteral(expr.args[0]))
    ) {
      acc.push(
        this.makeWarning("Found `dump` usage", expr.loc, {
          extraDescription:
            "Using `dump` in production code can sometimes indicate complex code that requires additional review",
        }),
      );
    }
    return acc;
  }
}
