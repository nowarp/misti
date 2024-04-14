import { MistiContext } from "../internals/context";
import { CompilationUnit } from "../internals/ir";
import { MistiTactError, Severity } from "../internals/errors";
import { ASTRef } from "@tact-lang/compiler/dist/grammar/ast";
/**
 * Abstract base class for a detector module, providing an interface for defining various types of detectors.
 */
export declare abstract class Detector {
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
    /**
     * Constructs an error object with a description and the source code location.
     *
     * @param description Descriptive text of the error.
     * @param severity Severity of the finding.
     * @param ref Reference to the source code that includes file information and position data.
     * @returns A new MistiTactError containing the error message and source code reference.
     */
    protected createError(description: string, severity: Severity, ref: ASTRef): MistiTactError;
}
/**
 * Asynchronously retrieves a built-in detector by its name.
 * If the detector is found in the BuiltInDetectors registry, it is loaded and returned;
 * otherwise, a warning is logged and `undefined` is returned.
 *
 * @param ctx Misti context.
 * @param name The name of the detector to retrieve. This name must match a key in the BuiltInDetectors object.
 * @returns A Promise that resolves to a Detector instance or `undefined` if the detector cannot be found or fails to load.
 */
export declare function findBuiltInDetector(ctx: MistiContext, name: string): Promise<Detector | undefined>;
