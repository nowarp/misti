import { MistiContext } from "../internals/context";
import { CompilationUnit } from "../internals/ir";
import { MistiTactError, Severity } from "../internals/errors";
import { ASTRef } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Abstract base class for a detector module, providing an interface for defining various types of detectors.
 */
export abstract class Detector {
  /**
   * Gets the short identifier of the detector, used in analyzer warnings.
   * @returns The unique identifier of the detector.
   */
  abstract get id(): string;

  /**
   * Executes the detector's logic to check for issues within the provided compilation unit.
   * @param ctx Misti context.
   * @param cu The compilation unit to be analyzed.
   * @returns List of errors has highlighted by this detector.
   */
  abstract check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[];
}

/**
 * A mapping of detector names to functions that load detector instances.
 * This allows for lazy loading of detectors, which may include importing necessary modules dynamically.
 */
const BuiltInDetectors: Record<string, () => Promise<Detector>> = {
  ReadOnlyVariables: () =>
    import("./builtin/readOnlyVariables").then(
      (module) => new module.ReadOnlyVariables(),
    ),
};

/**
 * Asynchronously retrieves a built-in detector by its name.
 * If the detector is found in the BuiltInDetectors registry, it is loaded and returned;
 * otherwise, a warning is logged and `undefined` is returned.
 *
 * @param ctx Misti context.
 * @param name The name of the detector to retrieve. This name must match a key in the BuiltInDetectors object.
 * @returns A Promise that resolves to a Detector instance or `undefined` if the detector cannot be found or fails to load.
 */
export async function findBuiltInDetector(
  ctx: MistiContext,
  name: string,
): Promise<Detector | undefined> {
  const detectorLoader = BuiltInDetectors[name];
  if (!detectorLoader) {
    ctx.logger.warn(`Built-in detector ${name} not found.`);
    return undefined;
  }
  try {
    return await detectorLoader();
  } catch (error) {
    ctx.logger.error(`Error loading built-in detector ${name}: ${error}`);
    return undefined;
  }
}
