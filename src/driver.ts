import { MistiContext } from "./internals/context";
import { Logger } from "./internals/logger";
import { tryMsg, InternalException } from "./internals/exceptions";
import { createIR } from "./internals/tactIRBuilder";
import { GraphvizDumper, JSONDumper } from "./internals/irDump";
import { ProjectName, CompilationUnit } from "./internals/ir";
import { MistiTactWarning } from "./internals/errors";
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
  private dumpConfig: boolean;
  private tactConfigPath: string;

  private constructor(
    tactPath: string,
    dumpCFG?: "json" | "dot",
    dumpCFGStdlib?: boolean,
    dumpCFGOutput?: string,
    dumpConfig?: boolean,
    soufflePath?: string,
    tactStdlibPath?: string,
    verbose?: boolean,
    quiet?: boolean,
    allDetectors?: boolean,
    mistiConfigPath?: string,
  ) {
    const singleContract = tactPath.endsWith(".tact");
    // Check if the input file exists.
    if (!fs.existsSync(tactPath)) {
      throw new Error(
        `${singleContract ? "Contract" : "Project"} ${tactPath} is not available.`,
      );
    }
    // Tact internals expect as an input a configuration file. Thus we have to
    // create a dummy config for a single contract with default options.
    this.tactConfigPath = singleContract
      ? SingleContractProjectManager.fromContractPath(tactPath).generate()
      : path.resolve(tactPath); // Tact supports absolute paths only
    this.ctx = new MistiContext({
      mistiConfigPath,
      soufflePath,
      tactStdlibPath,
      verbose,
      quiet,
      allDetectors,
      singleContractPath: singleContract ? tactPath : undefined,
    });
    this.dumpCFG = dumpCFG;
    this.dumpCFGStdlib = dumpCFGStdlib ? dumpCFGStdlib : false;
    this.dumpCFGOutput = dumpCFGOutput ? dumpCFGOutput : DUMP_STDOUT_PATH;
    this.dumpConfig = dumpConfig === undefined ? false : dumpConfig;
  }

  /**
   * Asynchronously creates a driver initializing all detectors.
   * @param tactPath Path to the Tact project configuration of to a single Tact contract.
   */
  public static async create(
    tactPath: string,
    options: CLIOptions,
  ): Promise<Driver> {
    const driver = new Driver(
      tactPath,
      options.dumpCfg,
      options.dumpCfgStdlib,
      options.dumpCfgOutput,
      options.dumpConfig,
      options.soufflePath,
      options.tactStdlibPath,
      options.verbose,
      options.quiet,
      options.allDetectors,
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
          return new DetectorClass(this.ctx) as Detector;
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
   * Dumps the Control Flow Graph (CFG) to stdout.
   */
  private async executeCFGDump(cus: Map<ProjectName, CompilationUnit>) {
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
  }

  /**
   * Dumps the Misti config in use to stdout.
   */
  private executeConfigDump(spaces: number = 2) {
    const mistiConfig = JSON.stringify(this.ctx.config, null, spaces);
    console.log(mistiConfig);
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
      await this.executeCFGDump(cus);
      return false;
    }
    if (this.dumpConfig === true) {
      this.executeConfigDump();
      return false;
    }

    const allWarnings = Array.from(cus.entries()).reduce(
      (acc, [projectName, cu]) => {
        acc.set(projectName, this.checkCU(cu));
        return acc;
      },
      new Map<ProjectName, MistiTactWarning[]>(),
    );
    const filteredWarnings = this.filterImportedWarnings(
      Array.from(cus.keys()),
      allWarnings,
    );
    const reported = new Set<string>();
    const collectedErrors: MistiTactWarning[] = Array.from(
      filteredWarnings.values(),
    ).reduce((acc: MistiTactWarning[], detectorsMap) => {
      const projectWarnings: MistiTactWarning[] = Array.from(
        detectorsMap.values(),
      ).flat();
      projectWarnings.sort((a, b) => b.severity - a.severity);
      projectWarnings.forEach((err) => {
        if (!reported.has(err.msg)) {
          acc.push(err);
          reported.add(err.msg);
        }
      });
      return acc;
    }, []);
    collectedErrors.forEach((err, index) => {
      const isLastWarning = index === collectedErrors.length - 1;
      this.reportError(err, !isLastWarning);
    });
    return collectedErrors.length > 0;
  }

  /**
   * Finds detector with a given name among the detectors available within the project.
   * @throws If not found
   */
  private findDetector(name: string): Detector {
    return this.detectors.find((d) => d.id === name)!;
  }

  /**
   * Filters warnings from multi-file projects detectors with respect to `WarningsBehavior`.
   */
  private filterImportedWarnings(
    allProjectNames: string[],
    allWarnings: Map<ProjectName, MistiTactWarning[]>,
  ): Map<ProjectName, MistiTactWarning[]> {
    // Early exit if there are no any detectors with the `intersect` behavior
    if (
      this.detectors.filter((d) => d.shareImportedWarnings === "intersect")
        .length === 0
    ) {
      return allWarnings;
    }

    // A mapping from warning messages to projects it has been reported.
    const errorsMap = new Map<string, ProjectName[]>();
    allWarnings.forEach((errors, projectName) => {
      errors.forEach((error) => {
        if (!errorsMap.has(error.msg)) {
          errorsMap.set(error.msg, []);
        }
        errorsMap.get(error.msg)!.push(projectName);
      });
    });

    const filteredWarnings: Map<ProjectName, MistiTactWarning[]> = new Map();
    for (const [projectName, errors] of allWarnings) {
      const projectErrors: MistiTactWarning[] = [];
      for (const error of errors) {
        const behavior = this.findDetector(
          error.detectorId,
        ).shareImportedWarnings;
        switch (behavior) {
          case "intersect":
            // The warning must be raised in all the projects.
            const projects = errorsMap.get(error.msg)!;
            if (
              new Set(allProjectNames).size === new Set(projects).size &&
              [...new Set(allProjectNames)].every((value) =>
                new Set(projects).has(value),
              )
            ) {
              projectErrors.push(error);
            }
            break;
          case "union":
            // Add everything
            projectErrors.push(error);
            break;
          default:
            throw InternalException.make(
              `Unsupported imported warnings behavior: ${behavior}`,
            );
        }
      }
      filteredWarnings.set(projectName, projectErrors);
    }

    return filteredWarnings;
  }

  /**
   * Logs a error using the logger.
   * @param error The error object to report.
   */
  reportError(error: MistiTactWarning, addNewline: boolean) {
    this.ctx.logger.error(
      `${error.message}${addNewline && !error.message.endsWith("\n") ? "\n" : ""}`,
    );
  }

  /**
   * Executes all detectors on a given compilation unit and collects any errors found.
   * @param cu The compilation unit to check.
   * @returns Errors generated by each of detectors.
   */
  private checkCU(cu: CompilationUnit): MistiTactWarning[] {
    return this.detectors
      .map((detector) => {
        this.ctx.logger.debug(
          `${cu.projectName}: Running ${detector.constructor.name}`,
        );
        const errors = detector.check(cu);
        this.ctx.logger.debug(
          `${cu.projectName}: Finished ${detector.constructor.name} `,
        );
        return errors;
      })
      .flat();
  }
}

const DUMP_STDOUT_PATH = "-";

/**
 * CLI options for configuring the analyzer.
 */
interface CLIOptions {
  /** Specifies the format for dumping CFG. If `undefined`, no dumps will be generated. */
  dumpCfg?: "json" | "dot";
  /** Determines whether to include standard library components in the dump. */
  dumpCfgStdlib?: boolean;
  /** Path where to save CFG dumps. If equals to DUMP_STDOUT_PATH, the stdout is used. */
  dumpCfgOutput?: string;
  /** Dump the used Misti JSON configuration file. If no custom configuration
   * available, dumps the default config. */
  dumpConfig?: boolean;
  /**
   * Specifies path to save generated Soufflé files. If equals to DUMP_STDOUT_PATH, the
   * stdout is used. If `undefined`, no dumps will be generated.
   */
  soufflePath?: string;
  /***
   * Path to Tact standard library. If not set, the default stdlib from the actual Tact setup will be used.
   */
  tactStdlibPath?: string;
  /** Add additional stdout output. */
  verbose?: boolean;
  /** Suppress driver's output. */
  quiet?: boolean;
  /** Enable all the available built-in detectors no matter if they are enabled in config. */
  allDetectors?: boolean;
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
 * @param tactPath Path to Tact project configuration or to a single Tact contract.
 * @param options CLI options.
 * @return true if detected any problems.
 */
export async function run(
  tactPath: string,
  options: CLIOptions = {
    dumpCfg: undefined,
    dumpCfgStdlib: false,
    dumpCfgOutput: DUMP_STDOUT_PATH,
    dumpConfig: undefined,
    soufflePath: undefined,
    tactStdlibPath: undefined,
    verbose: false,
    quiet: false,
    allDetectors: false,
    config: undefined,
  },
): Promise<boolean> {
  try {
    checkCLIOptions(options);
    const driver = await Driver.create(tactPath, options);
    return await driver.execute();
  } catch (err) {
    if (err instanceof Error) {
      const logger = new Logger();
      logger.error(err.message);
      if (err.stack !== undefined && process.env.MISTI_TRACE === "1") {
        logger.error(err.stack);
      }
      return true;
    } else {
      throw err;
    }
  }
}

/**
 * Encapsulates logic of handling single Tact contracts without user-defined configuration.
 */
class SingleContractProjectManager {
  private constructor(private contractPath: string) {}
  static fromContractPath(contractPath: string): SingleContractProjectManager {
    return new SingleContractProjectManager(contractPath);
  }

  /**
   * Creates a project directory that contains the given contract and the
   * configuration file to execute it.
   * @returns Path to the created Tact project configuration.
   */
  public generate(): string {
    const tempDir = this.createTempDir();
    const contractName = this.extractContractName();
    const configPath = path.join(tempDir, "tact.config.json");
    const relativeContractPath = `./${contractName}.tact`;
    const config = {
      projects: [
        {
          name: contractName,
          path: relativeContractPath,
          output: `./output`,
          options: {
            external: true,
          },
        },
      ],
    };
    tryMsg(
      () => fs.writeFileSync(configPath, JSON.stringify(config), "utf8"),
      `Cannot create a default project configuration at ${configPath}`,
    );
    tryMsg(
      () =>
        fs.copyFileSync(
          this.contractPath,
          path.join(tempDir, relativeContractPath),
        ),
      `Cannot access the ${this.contractPath} contact`,
    );
    return configPath;
  }

  private extractContractName(): string {
    const fileName = this.contractPath.split("/").pop();
    if (!fileName) {
      throw new Error(`Invalid contract path: ${this.contractPath}`);
    }
    return fileName.slice(0, -5);
  }

  /**
   * Creates a temporary directory for a single contract project configuration.
   */
  private createTempDir(): string {
    const baseDir = path.join("/tmp", "misti");
    fs.mkdirSync(baseDir, { recursive: true });
    const tempDirPrefix = path.join(baseDir, "temp-");
    const dirPath = fs.mkdtempSync(tempDirPrefix);
    return dirPath;
  }
}
