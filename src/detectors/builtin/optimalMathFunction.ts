import { CompilationUnit } from "../../internals/ir";
import {
  foldExpressions,
  evalsToLiteral,
  MakeLiteral,
} from "../../internals/tact";
import {
  AstExpression,
  idText,
  prettyPrint,
} from "../../internals/tact/imports";
import { Category, MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

const REPLACEMENTS: Record<string, string> = {
  log: "log2",
  pow: "pow2",
};

/**
 * A detector that highlights standard library math function calls that have more gas-efficient alternatives.
 *
 * ## Why is it bad?
 * Tact supports `log2`/`pow2` functions, which are more gas-efficient than `log(x, 2)`/`pow(x, 2)`.
 *
 * ## Example
 * ```tact
 * log(x, 2);
 * ```
 *
 * Use instead:
 * ```tact
 * log2(x)
 * ```
 */
export class OptimalMathFunction extends AstDetector {
  severity = Severity.LOW;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(
          node,
          (acc, expr) => {
            return this.findSuboptimalCall(acc, expr);
          },
          [] as MistiTactWarning[],
        ),
      );
    }, [] as MistiTactWarning[]);
  }

  private findSuboptimalCall(
    acc: MistiTactWarning[],
    expr: AstExpression,
  ): MistiTactWarning[] {
    if (expr.kind === "static_call") {
      const funName = idText(expr.function);
      const suggestedFun = REPLACEMENTS[funName] || undefined;
      if (
        suggestedFun &&
        expr.args.length === 2 &&
        evalsToLiteral(expr.args[1], MakeLiteral.number(2n))
      ) {
        const firstArg = expr.args[0]!;
        acc.push(
          this.makeWarning(
            `Use more gas-efficient function: ${suggestedFun}(${prettyPrint(firstArg)})`,
            expr.loc,
            {
              suggestion: "Choose more gas-efficient function",
            },
          ),
        );
      }
    }
    return acc;
  }
}
