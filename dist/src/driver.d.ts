import { MistiContext } from "./internals/context";
import { CompilationUnit } from "./internals/ir";
import { MistiTactError } from "./internals/errors";
import { Detector } from "./detectors/detector";
/**
 * Manages the initialization and execution of detectors for analyzing compilation units.
 */
export declare class Driver {
    private tactConfigPath;
    ctx: MistiContext;
    detectors: Detector[];
    constructor(tactConfigPath: string, mistiConfigPath?: string);
    /**
     * Executes checks on all compilation units and reports found errors sorted by severity.
     * @returns True if any errors were found, otherwise false.
     */
    execute(): Promise<boolean>;
    /**
     * Initializes all detectors specified in the configuration including external and built-in detectors.
     * @throws Error if a detector class cannot be found in the specified module or as a built-in.
     */
    initializeDetectors(): Promise<void>;
    /**
     * Logs a error to the standard error stream.
     * @param error The error object to report.
     */
    reportError(error: MistiTactError): void;
    /**
     * Executes all detectors on a given compilation unit and collects any errors found.
     * @param cu The compilation unit to check.
     * @returns An array of errors gathered from all detectors.
     */
    checkCU(cu: CompilationUnit): MistiTactError[];
}
/**
 * Entry point of code analysis.
 * @param tactConfig - Path to Tact project configuration
 * @param mistiConfig - Path to Misti configuration file
 * @return true if detected any problems
 */
export declare function run(tactConfig: string, mistiConfig?: string | undefined): Promise<boolean>;
