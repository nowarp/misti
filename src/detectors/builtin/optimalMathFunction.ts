import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import { evalConstantExpression } from "@tact-lang/compiler/dist/constEval";
import { CompilerContext } from "@tact-lang/compiler/dist/context";
import { AstExpression, idText } from "@tact-lang/compiler/dist/grammar/ast";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";

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
export class OptimalMathFunction extends ASTDetector {
  severity = Severity.LOW;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(node, [] as MistiTactWarning[], (acc, expr) => {
          return this.findSuboptimalCall(acc, expr);
        }),
      );
    }, [] as MistiTactWarning[]);
  }

  /**
   * Checks whether the given expression could be constantly evaluated to 2.
   */
  private constEvalTo2(expr: AstExpression): boolean {
    try {
      const value = evalConstantExpression(expr, new CompilerContext());
      return typeof value === "bigint" && value === 2n;
    } catch (_) {
      return false;
    }
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
        this.constEvalTo2(expr.args[1])
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
