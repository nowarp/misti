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
  private dump?: "json" | "dot" = undefined;
  private dumpStdlib: boolean;
  private dumpOutput: string;
  private tactConfigPath: string;

  private constructor(
    tactConfigPath: string,
    dumpStdlib?: boolean,
    dumpOutput?: string,
    mistiConfigPath?: string,
    dump?: "json" | "dot",
    verbose?: boolean,
    quiet?: boolean,
  ) {
    // Tact internals are able to work with absolute paths only
    this.tactConfigPath = path.resolve(tactConfigPath);
    this.ctx = new MistiContext(mistiConfigPath, verbose, quiet);
    this.dump = dump;
    this.dumpStdlib = dumpStdlib ? dumpStdlib : false;
    this.dumpOutput = dumpOutput ? dumpOutput : DUMP_STDOUT_PATH;
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
      options.dumpCfgStdlib,
      options.dumpCfgOutput,
      options.config,
      options.dumpCfg,
      options.verbose,
      options.quiet,
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
    if (this.dump !== undefined) {
      const promises = Array.from(cus.entries()).reduce((acc, [name, cu]) => {
        const dump =
          this.dump === "dot"
            ? GraphvizDumper.dumpCU(cu, this.dumpStdlib)
            : JSONDumper.dumpCU(cu, this.dumpStdlib);
        if (this.dumpOutput === DUMP_STDOUT_PATH) {
          console.log(dump);
        } else {
          const filename = this.dump === "dot" ? `${name}.dot` : `${name}.json`;
          const filepath = path.join(this.dumpOutput, filename);
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

interface CLIOptions {
  /** Specifies the format for dumping CFG. */
  dumpCfg?: "json" | "dot";
  /** Determines whether to include standard library components in the dump. */
  dumpCfgStdlib?: boolean;
  /** Path where to save CFG dumps. If equals to DUMP_STDOUT_PATH, the stdout is used. */
  dumpCfgOutput?: string;
  /** Optional path to the configuration file. If provided, the analyzer uses settings from this file. */
  config?: string;
  /** Add additional stdout output. */
  verbose?: boolean;
  /** Suppress driver's output. */
  quiet?: boolean;
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
    config: undefined,
    verbose: false,
    quiet: false,
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
