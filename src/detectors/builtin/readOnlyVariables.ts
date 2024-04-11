import { Detector } from "../detector";
import { MistiContext } from "../../internals/context";
import { CompilationUnit } from "../../internals/ir";
import { MistiTactError } from "../../internals/errors";

/**
 * A detector that identifies read-only variables and fields.
 *
 * These variables could typically be replaced with constants to optimize performance.
 * Alternatively, identifying read-only variables may reveal issues where unused values are being replaced unintentionally.
 */
export class ReadOnlyVariables extends Detector {
  get id(): string {
    return "ROV";
  }

  check(ctx: MistiContext, _cu: CompilationUnit): MistiTactError[] {
    ctx.logger.info("Checking for read-only variables...");
    return []; // TODO
  }
}
