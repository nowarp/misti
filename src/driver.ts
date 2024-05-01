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
  private tactConfigPath: string;

  private constructor(
    tactConfigPath: string,
    mistiConfigPath?: string,
    dump?: "json" | "dot",
  ) {
    // Tact internals are able to work with absolute paths only
    this.tactConfigPath = path.resolve(tactConfigPath);
    this.ctx = new MistiContext(mistiConfigPath);
    this.dump = dump;
  }

  /**
   * Asynchronously creates a driver initializing all detectors.
   */
  public static async create(
    tactConfigPath: string,
    options: CLIOptions,
  ): Promise<Driver> {
    const driver = new Driver(tactConfigPath, options.config, options.dump);
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
          const module = await import(config.modulePath);
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
            ? GraphvizDumper.dumpCU(cu)
            : JSONDumper.dumpCU(cu);
        const filename = this.dump === "dot" ? `${name}.dot` : `${name}.json`;
        const promise = fs.promises.writeFile(filename, dump, "utf8");
        acc.push(promise);
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

/**
 * Format of the CLI options.
 */
interface CLIOptions {
  dump?: "json" | "dot";
  config?: string;
}

/**
 * Entry point of code analysis.
 * @param tactConfig Path to Tact project configuration.
 * @param mistiConfig Path to Misti configuration file.
 * @return true if detected any problems.
 */
export async function run(
  tactConfig: string,
  options: CLIOptions = {
    dump: undefined,
    config: undefined,
  },
): Promise<boolean> {
  try {
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
