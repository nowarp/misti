import { CompilationUnit } from "../../internals/ir";
import {
  forEachExpression,
  PRG_INIT_NAMES,
  PRG_NATIVE_USE_NAMES,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import { AstStaticCall, idText } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that identifies all calls to `nativeRandom` and `nativeRandomInterval`
 * without a preceding PRG seed initialization.
 *
 * ## Why is it bad?
 * Using `nativeRandom` or `nativeRandomInterval` without first initializing the PRG seed via
 * `nativePrepareRandom`, `nativeRandomize`, or `nativeRandomizeLt` may lead to unintended behavior
 * or weak random number generation. This detector ensures that PRG seed initialization
 * is always performed before any use of random functions, enhancing contract security.
 *
 * ## Example
 * ```tact
 * // Bad: `nativeRandom` is used without prior PRG seed initialization
 * fun generateRandomValue(): Int {
 *   return nativeRandom()
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * fun test(): Int {
 *   nativePrepareRandom();
 * }
 *
 * // OK: PRG has been initialized somewhere in the contract
 * fun generateRandomValue(): Int {
 *   return nativeRandom()
 * }
 * ```
 */
export class EnsurePrgSeed extends AstDetector {
  severity = Severity.MEDIUM;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const randomCalls = cu.ast.getProgramEntries().reduce(
      (acc, node) => {
        forEachExpression(node, (expr) => {
          if (expr.kind === "static_call") {
            if (PRG_INIT_NAMES.has(idText(expr.function))) {
              acc.hasInitializer = true;
            }
            if (PRG_NATIVE_USE_NAMES.has(idText(expr.function))) {
              acc.uses.push(expr);
            }
          }
        });
        return acc;
      },
      { hasInitializer: false, uses: [] } as {
        hasInitializer: boolean;
        uses: AstStaticCall[];
      },
    );
    if (randomCalls.uses.length === 0 || randomCalls.hasInitializer) {
      return [];
    }
    return randomCalls.uses.reduce((acc, use) => {
      acc.push(
        this.makeWarning(
          `PRG seed should be initialized before using ${idText(use.function)}`,
          use.loc,
          {
            suggestion: `Use ${Array.from(PRG_INIT_NAMES)
              .map((name) => "`" + name + "`")
              .join(
                ", ",
              )} to initialize the PRG seed or choose the safer \`randomInt\` function`,
          },
        ),
      );
      return acc;
    }, [] as MistiTactWarning[]);
  }
}
