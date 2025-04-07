import { AstDetector } from "../../src/detectors/detector";
import { CompilationUnit, FunctionName } from "../../src/internals/ir";
import { Warning, Severity } from "../../src/internals/warnings";

/**
 * An example of a custom detector that showcases the usage of the detector API.
 * It reports all contracts that don't have an explicit implementation of the
 * init function.
 *
 * ## Why is it bad?
 * It is better to have an explicit definition of the init function to ensure
 * the developer did not forget to initialize something.
 *
 * ## Example
 * ```tact
 * contract Main {
 *   val: Int = 42;
 *   // Bad: no init function
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Main {
 *   val: Int = 42;
 *   init() {} // Good: the init function has been added
 * }
 * ```
 */
export class ImplicitInit extends AstDetector {
  severity = Severity.INFO;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return Array.from(cu.getContracts()).reduce(
      (foundErrors, [_, contract]) => {
        if (!cu.findMethodCFGByName(contract.name, "init" as FunctionName)) {
          const err = this.makeWarning(
            `Contract ${contract.name} doesn't define an init function`,
            contract.loc,
          );
          foundErrors.push(err);
        }
        return foundErrors;
      },
      [] as Warning[],
    );
  }
}
