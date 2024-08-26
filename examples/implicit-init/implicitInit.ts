import { Detector } from "../../src/detectors/detector";
import { CompilationUnit } from "../../src/internals/ir";
import { MistiTactWarning, Severity } from "../../src/internals/warnings";

/**
 * An example of a custom detector that showcases the usage of the detector API.
 *
 * It reports all the contracts that doesn't have an explicit implementation of the init function.
 */
export class ImplicitInit extends Detector {
  check(cu: CompilationUnit): MistiTactWarning[] {
    return Array.from(cu.contracts).reduce((foundErrors, [_, contract]) => {
      if (!cu.findMethodCFGByName(contract.name, "init")) {
        const err = this.makeWarning(
          `Contract ${contract.name} doesn't define an init function`,
          Severity.INFO,
          contract.ref,
        );
        foundErrors.push(err);
      }
      return foundErrors;
    }, [] as MistiTactWarning[]);
  }
}
