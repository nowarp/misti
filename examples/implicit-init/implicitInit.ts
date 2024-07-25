import { Detector } from "../../src/detectors/detector";
import { MistiContext } from "../../src/internals/context";
import { CompilationUnit } from "../../src/internals/ir";
import {
  createError,
  MistiTactError,
  Severity,
} from "../../src/internals/errors";

/**
 * An example of a custom detector that showcases the usage of the detector API.
 *
 * It reports all the contracts that doesn't have an explicit implementation of the init function.
 */
export class ImplicitInit extends Detector {
  check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    return Array.from(cu.contracts).reduce((foundErrors, [_, contract]) => {
      if (!cu.findMethodCFGByName(contract.name, "init")) {
        const err = createError(
          ctx,
          `contract ${contract.name} doesn't define an init function`,
          Severity.INFO,
          contract.ref,
        );
        foundErrors.push(err);
      }
      return foundErrors;
    }, [] as MistiTactError[]);
  }
}
