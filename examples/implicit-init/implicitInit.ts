import { Detector } from "../../src/detectors/detector";
import { CompilationUnit } from "../../src/internals/ir";
import { MistiTactError, Severity } from "../../src/internals/errors";

/**
 * An example of a custom detector that showcases the usage of the detector API.
 *
 * It reports all the contracts that doesn't have an explicit implementation of the init function.
 */
export class ImplicitInit extends Detector {
  check(cu: CompilationUnit): MistiTactError[] {
    return Array.from(cu.contracts).reduce((foundErrors, [_, contract]) => {
      if (!cu.findMethodCFGByName(contract.name, "init")) {
        const err = this.makeError(
          `Contract ${contract.name} doesn't define an init function`,
          Severity.INFO,
          contract.ref,
        );
        foundErrors.push(err);
      }
      return foundErrors;
    }, [] as MistiTactError[]);
  }
}
