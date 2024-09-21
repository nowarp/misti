import { CompilationUnit } from "../../internals/ir";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";

/**
 * An optional detector that highlights all the `asm` functions.
 *
 * ## Why is it bad?
 Using TVM Assembly is a potentially dangerous operation that requires additional
 attention from an auditor. This optional detector will highlight all its uses to
 assist in contract security audits.
 *
 * ## Example
 * ```tact
 * // Highlighted: the asm function use should be audited
 * asm fun getStorageFee(cells: Int, bits: Int, seconds: Int, is_masterchain: Bool): Int { GETSTORAGEFEE }
 * ```
 */
export class AsmIsUsed extends ASTDetector {
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      if (node.kind === "asm_function_def") {
        acc.push(
          this.makeWarning("asm function is used", Severity.INFO, node.loc, {
            suggestion:
              "Using TVM assembly is a potentially dangerous operation that requires additional review",
          }),
        );
      }
      return acc;
    }, [] as MistiTactWarning[]);
  }
}
