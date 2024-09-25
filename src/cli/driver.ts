import { CLIOptions, DUMP_STDOUT_PATH } from "./options";
import { Detector, findBuiltInDetector } from "../detectors/detector";
import { ASTDumper } from "../internals/astDump";
import { MistiContext } from "../internals/context";
import {
  ExecutionException,
  InternalException,
  tryMsg,
} from "../internals/exceptions";
import { CompilationUnit, ProjectName } from "../internals/ir";
import { createIR } from "../internals/ir/builders/tactIRBuilder";
import { GraphvizDumper, JSONDumper } from "../internals/irDump";
import { Logger } from "../internals/logger";
import { MistiTactWarning, severityToString } from "../internals/warnings";
import fs from "fs";
import JSONbig from "json-bigint";
import path from "path";

export interface MistiResult {
  /**
   * Number of warnings reported.
   */
  warningsFound: number;
  /**
   * A string representing the output of Misti. It could be an warning report or
   * the requested information, e.g., the results of executing internal tools.
   */
  output?: string;
  /**
   * Error output when Misti cannot complete the requested operation.
   */
  error?: string;
}

/**
 * Manages the initialization and execution of detectors for analyzing compilation units.
 */
export class Driver {
  ctx: MistiContext;
  detectors: Detector[] = [];
  private suppressedDetectorNames: Set<string>;
  private dumpCFG?: "json" | "dot";
  private dumpAST: boolean;
  private dumpCFGStdlib: boolean;
  private dumpOutput: string;
  private dumpConfig: boolean;
  private colorizeOutput: boolean;
  private tactConfigPath: string;

  private constructor(tactPath: string, options: CLIOptions) {
    const singleContract = tactPath.endsWith(".tact");

    // Check if the input file exists.
    if (!fs.existsSync(tactPath)) {
      throw ExecutionException.make(
        `${singleContract ? "Contract" : "Project"} ${tactPath} is not available.`,
      );
    }

    // Tact internals expect as an input a configuration file. Thus we have to
    // create a dummy config for a single contract with default options.
    this.tactConfigPath = singleContract
      ? SingleContractProjectManager.fromContractPath(tactPath).generate()
      : path.resolve(tactPath); // Tact supports absolute paths only

    this.ctx = new MistiContext(tactPath, options);
    this.dumpCFG = options.dumpCfg;
    this.suppressedDetectorNames = new Set(options.suppress ?? []);
    this.dumpAST = options.dumpAst || false;
    this.dumpCFGStdlib = options.dumpIncludeStdlib || false;
    this.dumpOutput = options.dumpOutput || DUMP_STDOUT_PATH;
    this.dumpConfig = options.dumpConfig ?? false;
    this.colorizeOutput = options.colors ?? true;
  }

  /**
   * Asynchronously creates a driver initializing all detectors.
   * @param tactPath Path to the Tact project configuration of to a single Tact contract.
   */
  public static async create(
    tactPath: string,
    options: CLIOptions,
  ): Promise<Driver> {
    const driver = new Driver(tactPath, options);
    await driver.initializeDetectors();
    if (!driver.ctx.souffleAvailable) {
      this.warnOnDisabledDetectors(driver);
    }
    return driver;
  }

  /**
   * Warns the user about the Soufflé detectors that were disabled due to missing Soufflé installation.
   */
  private static warnOnDisabledDetectors(driver: Driver): void {
    const disabled = driver.detectors.reduce((acc, detector) => {
      if (detector.usesSouffle) {
        acc.push(`* ${detector.id}`);
      }
      return acc;
    }, [] as string[]);
    if (disabled.length === 0) {
      return;
    }
    driver.ctx.logger.warn(
      [
        "No Soufflé installation found. The following detectors will be disabled:",
        disabled.join("\n"),
        "Please install Soufflé according to the installation instructions to enable them: https://souffle-lang.github.io/install",
      ].join("\n"),
    );
  }

  /**
   * Initializes all detectors specified in the configuration including external and built-in detectors.
   * @throws Error if a detector class cannot be found in the specified module or as a built-in.
   */
  async initializeDetectors(): Promise<void> {
    const detectorPromises = this.ctx.config.detectors.reduce<
      Promise<Detector>[]
    >((acc, config) => {
      if (this.suppressedDetectorNames.has(config.className)) {
        this.ctx.logger.debug(`Suppressed detector: ${config.className}`);
        return acc;
      }
      acc.push(
        (async () => {
          if (config.modulePath) {
            let module;
            try {
              const absolutePath = path.resolve(config.modulePath);
              const relativePath = path.relative(__dirname, absolutePath);
              module = await import(
                relativePath.replace(path.extname(relativePath), "")
              );
            } catch (error) {
              this.ctx.logger.error(
                `Failed to import module: ${config.modulePath}`,
              );
              this.ctx.logger.error(`${error}`);
            }
            const DetectorClass = module[config.className];
            if (!DetectorClass) {
              throw ExecutionException.make(
                `Detector class ${config.className} not found in module ${config.modulePath}`,
              );
            }
            return new DetectorClass(this.ctx) as Detector;
          } else {
            const detector = await findBuiltInDetector(
              this.ctx,
              config.className,
            );
            if (!detector) {
              throw ExecutionException.make(
                `Built-in detector ${config.className} not found`,
              );
            }
            return detector;
          }
        })(),
      );
      return acc;
    }, []);
    this.detectors = await Promise.all(detectorPromises);
    this.ctx.logger.debug(
      `Enabled detectors (${this.detectors.length}): ${this.detectors.map((d) => d.id).join(", ")}`,
    );
  }

  /**
   * Generic method to collect and output dumps.
   */
  private async getDump(
    cus: Map<ProjectName, CompilationUnit>,
    dumpFunction: (cu: CompilationUnit, includeStdlib: boolean) => string,
    outputExtension: string,
    includeStdlib: boolean,
  ): Promise<string> {
    const results: string[] = [];
    const promises = Array.from(cus.entries()).reduce((acc, [name, cu]) => {
      const dump = dumpFunction(cu, includeStdlib);
      if (this.dumpOutput === DUMP_STDOUT_PATH) {
        results.push(dump);
      } else {
        const filename = `${name}${outputExtension}`;
        const filepath = path.join(this.dumpOutput, filename);
        const promise = fs.promises
          .writeFile(filepath, dump, "utf8")
          .then(() => {
            this.ctx.logger.debug(`Dump has been saved at ${filepath}`);
          });
        acc.push(promise);
      }
      return acc;
    }, [] as Promise<void>[]);
    await Promise.all(promises);
    return results.join("\n");
  }

  /**
   * Collects output of the Control Flow Graph (CFG) dump functions.
   */
  private async getCFGDump(
    cus: Map<ProjectName, CompilationUnit>,
  ): Promise<string> {
    const dumpFunction =
      this.dumpCFG === "dot"
        ? (cu: CompilationUnit, includeStdlib: boolean) =>
            GraphvizDumper.dumpCU.call(GraphvizDumper, cu, includeStdlib)
        : (cu: CompilationUnit, includeStdlib: boolean) =>
            JSONDumper.dumpCU(cu, includeStdlib);
    const outputExtension = this.dumpCFG === "dot" ? ".dot" : ".json";
    return this.getDump(cus, dumpFunction, outputExtension, this.dumpCFGStdlib);
  }

  /**
   * Dumps AST of the input source.
   */
  private async getASTDump(
    cus: Map<ProjectName, CompilationUnit>,
  ): Promise<string> {
    const dumpFunction = (cu: CompilationUnit, includeStdlib: boolean) =>
      ASTDumper.dumpCU.call(ASTDumper, cu, includeStdlib);
    return this.getDump(cus, dumpFunction, ".ast.json", this.dumpCFGStdlib);
  }

  /**
   * Returns a string representing the Misti config in use.
   */
  private getConfigDump(spaces: number = 2): string {
    return JSON.stringify(this.ctx.config, null, spaces);
  }

  /**
   * Executes checks on all compilation units and reports found warnings sorted by severity.
   * @returns True if any warnings were found, otherwise false.
   */
  public async execute(): Promise<MistiResult> {
    const cus: Map<ProjectName, CompilationUnit> = createIR(
      this.ctx,
      this.tactConfigPath,
    );
    if (this.dumpCFG !== undefined) {
      const output = await this.getCFGDump(cus);
      return { warningsFound: 0, output };
    }
    if (this.dumpAST === true) {
      const output = await this.getASTDump(cus);
      return { warningsFound: 0, output };
    }
    if (this.dumpConfig === true) {
      const output = this.getConfigDump();
      return { warningsFound: 0, output };
    }

    const allWarnings = await (async () => {
      const warningsMap = new Map<ProjectName, MistiTactWarning[]>();
      await Promise.all(
        Array.from(cus.entries()).map(async ([projectName, cu]) => {
          const warnings = await this.checkCU(cu);
          warningsMap.set(projectName, warnings);
        }),
      );
      return warningsMap;
    })();
    const filteredWarnings = this.filterImportedWarnings(
      Array.from(cus.keys()),
      allWarnings,
    );
    const reported = new Set<string>();
    const collectedWarnings: MistiTactWarning[] = Array.from(
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
    const formattedWarnings = collectedWarnings.reduce((acc, err, index) => {
      const isLastWarning = index === collectedWarnings.length - 1;
      acc.push(this.formatWarning(err, !isLastWarning));
      return acc;
    }, [] as string[]);
    return {
      warningsFound: formattedWarnings.length,
      output: formattedWarnings.join("\n"),
    };
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
    const warningsMap = new Map<string, ProjectName[]>();
    allWarnings.forEach((warnings, projectName) => {
      warnings.forEach((warning) => {
        if (!warningsMap.has(warning.msg)) {
          warningsMap.set(warning.msg, []);
        }
        warningsMap.get(warning.msg)!.push(projectName);
      });
    });

    const filteredWarnings: Map<ProjectName, MistiTactWarning[]> = new Map();
    for (const [projectName, warnings] of allWarnings) {
      const projectWarnings: MistiTactWarning[] = [];
      for (const warn of warnings) {
        const behavior = this.findDetector(
          warn.detectorId,
        ).shareImportedWarnings;
        switch (behavior) {
          case "intersect":
            // The warning must be raised in all the projects.
            const projects = warningsMap.get(warn.msg)!;
            if (
              new Set(allProjectNames).size === new Set(projects).size &&
              [...new Set(allProjectNames)].every((value) =>
                new Set(projects).has(value),
              )
            ) {
              projectWarnings.push(warn);
            }
            break;
          case "union":
            // Add everything
            projectWarnings.push(warn);
            break;
          default:
            throw InternalException.make(
              `Unsupported imported warnings behavior: ${behavior}`,
            );
        }
      }
      filteredWarnings.set(projectName, projectWarnings);
    }

    return filteredWarnings;
  }

  /**
   * Returns string representation of the warning.
   */
  private formatWarning(warn: MistiTactWarning, addNewline: boolean): string {
    const severity = severityToString(warn.severity, {
      colorize: this.colorizeOutput,
    });
    return `${severity} ${warn.detectorId}: ${warn.msg}${addNewline && !warn.msg.endsWith("\n") ? "\n" : ""}`;
  }

  /**
   * Executes all detectors on a given compilation unit and collects any warnings found.
   * @param cu The compilation unit to check.
   * @returns Warnings generated by each of detectors.
   */
  private async checkCU(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warningsPromises = this.detectors.map(async (detector) => {
      if (!this.ctx.souffleAvailable && detector.usesSouffle) {
        this.ctx.logger.debug(
          `${cu.projectName}: Skipping ${detector.id} since no Soufflé installation is available`,
        );
        return [];
      }
      this.ctx.logger.debug(`${cu.projectName}: Running ${detector.id}`);
      const warnings = await detector.check(cu);
      this.ctx.logger.debug(`${cu.projectName}: Finished ${detector.id}`);
      return warnings;
    });
    try {
      return (await Promise.all(warningsPromises)).flat();
    } catch (error) {
      throw InternalException.make(
        `${cu.projectName} execution error:\n${error}`,
      );
    }
  }
}

/**
 * Provides an API to manage the driver instance and store the execution result.
 */
export class Runner {
  private constructor(
    private readonly driver: Driver,
    private result: MistiResult | undefined = undefined,
  ) {}

  /**
   * @param tactPath Path to Tact project configuration or to a single Tact contract.
   * @param options CLI options.
   */
  public static async make(
    tactPath: string,
    options: CLIOptions = {
      dumpCfg: undefined,
      dumpIncludeStdlib: false,
      dumpOutput: DUMP_STDOUT_PATH,
      dumpConfig: undefined,
      colors: undefined,
      souffleBinary: undefined,
      soufflePath: undefined,
      souffleVerbose: undefined,
      tactStdlibPath: undefined,
      verbose: false,
      quiet: false,
      detectors: undefined,
      suppress: undefined,
      allDetectors: false,
      config: undefined,
    },
  ): Promise<Runner> {
    this.checkCLIOptions(options);
    const driver = await Driver.create(tactPath, options);
    return new Runner(driver);
  }

  /**
   * Entry point of code analysis. Saves MistiResult to an object accessible in `this.getResult()`.
   */
  public async run(): Promise<void> {
    try {
      this.result = await this.driver.execute();
    } catch (err) {
      const result = [] as string[];
      if (err instanceof Error) {
        result.push(err.message);
        if (err.stack !== undefined && process.env.MISTI_TRACE === "1") {
          result.push(err.stack);
        }
      } else {
        result.push(`An error occurred:\n${JSONbig.stringify(err)}`);
      }
      const error = result.join("\n");
      new Logger().error(error);
      this.result = { warningsFound: 0, error };
    }
  }

  /**
   * Returns the result of the execution.
   * @throws If the runner hasn't been executed.
   */
  public getResult(): MistiResult | never {
    if (this.result !== undefined) {
      return this.result;
    } else {
      throw InternalException.make("Runner hasn't been executed");
    }
  }

  /**
   * Returns the driver object in use.
   */
  public getDriver(): Driver {
    return this.driver;
  }

  /**
   * Check CLI options for ambiguities.
   * @throws If Misti cannot be executed with the given options
   */
  private static checkCLIOptions(options: CLIOptions): void | never {
    if (options.verbose === true && options.quiet === true) {
      throw ExecutionException.make(
        `Please choose only one option: --verbose or --quiet`,
      );
    }
    if (options.dumpCfg !== undefined && options.dumpAst === true) {
      throw ExecutionException.make(
        `Please choose only one option: --dump-cfg or --dump-ast`,
      );
    }
    if (options.allDetectors === true && options.detectors !== undefined) {
      throw ExecutionException.make(
        `--detectors and --all-detectors cannot be used simultaneously`,
      );
    }
  }
}
