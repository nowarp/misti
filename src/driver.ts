import { MistiContext } from "./internals/context";
import { createIR } from "./internals/tactIRBuilder";
import { GraphvizDumper, JSONDumper } from "./internals/irDump";
import { ProjectName, CompilationUnit } from "./internals/ir";
import { MistiTactError } from "./internals/errors";
import { Detector, findBuiltInDetector } from "./detectors/detector";

import path from "path";
import fs from "fs";

/**
 * Manages the initialization and execution of detectors for analyzing compilation units.
 */
export class Driver {
  ctx: MistiContext;
  detectors: Detector[] = [];
  private dumpCFG?: "json" | "dot" = undefined;
  private dumpCFGStdlib: boolean;
  private dumpCFGOutput: string;
  private tactConfigPath: string;

  private constructor(
    tactConfigPath: string,
    dumpCFG?: "json" | "dot",
    dumpCFGStdlib?: boolean,
    dumpCFGOutput?: string,
    soufflePath?: string,
    verbose?: boolean,
    quiet?: boolean,
    mistiConfigPath?: string,
  ) {
    // Tact internals are able to work with absolute paths only
    this.tactConfigPath = path.resolve(tactConfigPath);
    this.ctx = new MistiContext(mistiConfigPath, soufflePath, verbose, quiet);
    this.dumpCFG = dumpCFG;
    this.dumpCFGStdlib = dumpCFGStdlib ? dumpCFGStdlib : false;
    this.dumpCFGOutput = dumpCFGOutput ? dumpCFGOutput : DUMP_STDOUT_PATH;
  }

  /**
   * Asynchronously creates a driver initializing all detectors.
   */
  public static async create(
    tactConfigPath: string,
    options: CLIOptions,
  ): Promise<Driver> {
    const driver = new Driver(
      tactConfigPath,
      options.dumpCfg,
      options.dumpCfgStdlib,
      options.dumpCfgOutput,
      options.soufflePath,
      options.verbose,
      options.quiet,
      options.config,
    );
    await driver.initializeDetectors();
    return driver;
  }

  /**
   * Initializes all detectors specified in the configuration including external and built-in detectors.
   * @throws Error if a detector class cannot be found in the specified module or as a built-in.
   */
  async initializeDetectors(): Promise<void> {
    const detectorPromises = this.ctx.config.detectorsEnabled.map(
      async (config) => {
        if (config.modulePath) {
          // Dynamic import for external detectors
          let module;
          try {
            module = await import(config.modulePath);
          } catch (error) {
            console.error(`Failed to import module: ${config.modulePath}`);
            console.error(error);
          }
          const DetectorClass = module[config.className];
          if (!DetectorClass) {
            throw new Error(
              `Detector class ${config.className} not found in module ${config.modulePath}`,
            );
          }
          return new DetectorClass() as Detector;
        } else {
          // Attempt to find a built-in detector
          const detector = await findBuiltInDetector(
            this.ctx,
            config.className,
          );
          if (!detector) {
            throw new Error(`Built-in detector ${config.className} not found`);
          }
          return detector;
        }
      },
    );
    // Wait for all detectors to be initialized
    this.detectors = await Promise.all(detectorPromises);
  }

  /**
   * Executes checks on all compilation units and reports found errors sorted by severity.
   * @returns True if any errors were found, otherwise false.
   */
  public async execute(): Promise<boolean> {
    const cus: Map<ProjectName, CompilationUnit> = createIR(
      this.ctx,
      this.tactConfigPath,
    );
    if (this.dumpCFG !== undefined) {
      const promises = Array.from(cus.entries()).reduce((acc, [name, cu]) => {
        const dump =
          this.dumpCFG === "dot"
            ? GraphvizDumper.dumpCU(cu, this.dumpCFGStdlib)
            : JSONDumper.dumpCU(cu, this.dumpCFGStdlib);
        if (this.dumpCFGOutput === DUMP_STDOUT_PATH) {
          console.log(dump);
        } else {
          const filename =
            this.dumpCFG === "dot" ? `${name}.dot` : `${name}.json`;
          const filepath = path.join(this.dumpCFGOutput, filename);
          const promise = fs.promises.writeFile(filepath, dump, "utf8");
          this.ctx.logger.debug(`CFG dump will be saved at ${filepath}`);
          acc.push(promise);
        }
        return acc;
      }, [] as Promise<void>[]);
      await Promise.all(promises);
      return false;
    }
    return Array.from(cus.entries()).reduce(
      (foundErrors, [projectName, cu]) => {
        this.ctx.logger.debug(`Checking ${projectName}...`);
        const thisCUErrors: MistiTactError[] = this.checkCU(cu);
        thisCUErrors.sort((a, b) => b.severity - a.severity);
        thisCUErrors.forEach((error) => {
          this.reportError(error);
          foundErrors = true;
        });
        return foundErrors;
      },
      false,
    );
  }

  /**
   * Logs a error to the standard error stream.
   * @param error The error object to report.
   */
  reportError(error: MistiTactError) {
    this.ctx.logger.error(`${error.message}`);
  }

  /**
   * Executes all detectors on a given compilation unit and collects any errors found.
   * @param cu The compilation unit to check.
   * @returns An array of errors gathered from all detectors.
   */
  checkCU(cu: CompilationUnit): MistiTactError[] {
    return this.detectors.reduce((foundErrors, detector) => {
      this.ctx.logger.debug(`Running ${detector.constructor.name}...`);
      return foundErrors.concat(detector.check(this.ctx, cu));
    }, [] as MistiTactError[]);
  }
}

const DUMP_STDOUT_PATH = "-";

/**
 * CLI options for configuring the linter.
 */
interface CLIOptions {
  /** Specifies the format for dumping CFG. If `undefined`, no dumps will be generated. */
  dumpCfg?: "json" | "dot";
  /** Determines whether to include standard library components in the dump. */
  dumpCfgStdlib?: boolean;
  /** Path where to save CFG dumps. If equals to DUMP_STDOUT_PATH, the stdout is used. */
  dumpCfgOutput?: string;
  /**
   * Specifies path to save generated Soufflé files. If equals to DUMP_STDOUT_PATH, the
   * stdout is used. If `undefined`, no dumps will be generated.
   */
  soufflePath?: string;
  /** Add additional stdout output. */
  verbose?: boolean;
  /** Suppress driver's output. */
  quiet?: boolean;
  /** Optional path to the configuration file. If provided, the analyzer uses settings from this file. */
  config?: string;
}

/**
 * Check CLI options for ambiguities.
 * @throws If Misti cannot be executed with the given options
 */
function checkCLIOptions(options: CLIOptions) {
  if (options.verbose === true && options.quiet === true) {
    throw new Error(`Please choose only one option: --verbose or --quiet`);
  }
}

/**
 * Entry point of code analysis.
 * @param tactConfig Path to Tact project configuration.
 * @param options CLI options.
 * @return true if detected any problems.
 */
export async function run(
  tactConfig: string,
  options: CLIOptions = {
    dumpCfg: undefined,
    dumpCfgStdlib: false,
    dumpCfgOutput: DUMP_STDOUT_PATH,
    soufflePath: undefined,
    verbose: false,
    quiet: false,
    config: undefined,
  },
): Promise<boolean> {
  try {
    checkCLIOptions(options);
    const driver = await Driver.create(tactConfig, options);
    return await driver.execute();
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.message);
      return true;
    } else {
      throw err;
    }
  }
}
