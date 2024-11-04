import { CFG, CompilationUnit } from "../../internals/ir";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { DataflowDetector } from "../detector";

/**
 * A detector that identifies improper use of exit codes outside the developer-allowed range.
 *
 * ## Why is it bad?
 * In the TON blockchain, exit codes are divided into specific ranges: 0 to 127
 * are reserved for the TVM or FunC, and 128 to 255 are reserved for Tact. This
 * structure leaves the range from 256 to 65535 for developers to define custom
 * exit codes.
 *
 * When exit codes are defined outside this allowed range, it may lead to
 * conflicts with existing reserved codes, causing unintended behavior or
 * errors in the contract.
 *
 * ## Example
 * ```tact
 * contract Foo {
 *     const NotOwnerExitCode: Int = 128; // Bad: exit code defined in the reserved range for Tact
 *     receive("foobar") {
 *         nativeThrowUnless(self.NotOwnerExitCode, sender() == self.owner);
 *     }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Foo {
 *     const NotOwnerExitCode: Int = 256; // OK: using exit code from the allowed range
 *     receive("foobar") {
 *         nativeThrowUnless(self.NotOwnerExitCode, sender() == self.owner);
 *     }
 * }
 * ```
 *
 * ## Resources
 * 1. [Exit Codes | Tact Docs](https://docs.tact-lang.org/book/exit-codes)
 */
export class ExitCodeUsage extends DataflowDetector {
  severity = Severity.CRITICAL;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    cu.forEachCFG(
      (cfg: CFG) => {
        const node = cu.ast.getFunction(cfg.id);
        if (node === undefined) {
          return;
        }
        // const lattice = new CellOverflowLattice();
        // const transfer = new CellOverflowTransfer();
        // const solver = new WorklistSolver(
        //   cu,
        //   cfg,
        //   transfer,
        //   lattice,
        //   "forward",
        // );
      },
      { includeStdlib: false },
    );
    return warnings;
  }
}
