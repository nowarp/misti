import { CLIOptions } from "./options";
import {
  MistiResult,
  ToolOutput,
  MistiResultWarnings,
  MistiResultTool,
  WarningOutput,
} from "./result";
import { SingleContractProjectManager } from "./singleContract";
import { OutputFormat } from "./types";
import { Detector, findBuiltInDetector } from "../detectors/detector";
import { MistiContext } from "../internals/context";
import { ExecutionException, InternalException } from "../internals/exceptions";
import { CompilationUnit, ProjectName } from "../internals/ir";
import { createIR } from "../internals/ir/builders/tactIRBuilder";
import { Logger } from "../internals/logger";
import {
  MistiTactWarning,
  severityToString,
  Severity,
} from "../internals/warnings";
import { Tool, findBuiltInTool } from "../tools/tool";
import fs from "fs";
import JSONbig from "json-bigint";
import path from "path";

export const DUMP_STDOUT_PATH = "-";

/**
 * Manages the initialization and execution of detectors for analyzing compilation units.
 */
export class Driver {
  ctx: MistiContext;
  detectors: Detector[] = [];
  tools: Tool<any>[] = [];
  outputPath: string;
  suppressedDetectorNames: Set<string>;
  colorizeOutput: boolean;
  tactConfigPath: string;
  /** Minimum severity level to report warnings. */
  minSeverity: Severity;
  outputFormat: OutputFormat;

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
    this.suppressedDetectorNames = new Set(options.suppress ?? []);
    this.colorizeOutput = options.colors ?? true;
    this.minSeverity = options.minSeverity ?? Severity.INFO;
    this.outputFormat = options.outputFormat ?? "plain";
    this.outputPath = options.outputPath ?? DUMP_STDOUT_PATH;
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
    await driver.initializeTools();
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
   * Initializes all built-in tools specified in the configuration.
   * @throws Error if a tool cannot be found or initialized.
   */
  async initializeTools(): Promise<void> {
    const toolPromises = this.ctx.config.tools.map(async (config) => {
      const tool = await findBuiltInTool(
        this.ctx,
        config.className,
        config.options || {},
      );
      if (!tool) {
        throw ExecutionException.make(
          `Built-in tool ${config.className} not found`,
        );
      }
      return tool;
    });

    this.tools = await Promise.all(toolPromises);
    this.ctx.logger.debug(
      `Enabled tools (${this.tools.length}): ${this.tools.map((t) => t.id).join(", ")}`,
    );
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
    return this.tools.length > 0
      ? this.executeTools(cus)
      : this.executeAnalysis(cus);
  }

  /**
   * Executes all the initialized detectors on the compilation units.
   * @param cus Map of compilation units
   * @returns MistiResult containing detectors output
   */
  private async executeAnalysis(
    cus: Map<ProjectName, CompilationUnit>,
  ): Promise<MistiResultWarnings> {
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
    const warningsOutput: WarningOutput[] = [];
    for (const [projectName, detectorsMap] of filteredWarnings.entries()) {
      const projectWarnings: MistiTactWarning[] = Array.from(
        detectorsMap.values(),
      ).flat();
      const collectedWarnings: MistiTactWarning[] = [];
      projectWarnings.forEach((warn) => {
        if (!reported.has(warn.msg) && warn.severity >= this.minSeverity) {
          collectedWarnings.push(warn);
          reported.add(warn.msg);
        }
      });
      if (collectedWarnings.length > 0) {
        const sortedWarnings = collectedWarnings.sort(
          (a, b) => b.severity - a.severity,
        );
        const formattedWarnings = sortedWarnings.reduce((acc, warn, index) => {
          const isLastWarning = index === sortedWarnings.length - 1;
          acc.push(this.formatWarning(warn, !isLastWarning));
          return acc;
        }, [] as string[]);
        warningsOutput.push({
          projectName,
          warnings: formattedWarnings,
        });
      }
    }
    return {
      kind: "warnings",
      warnings: warningsOutput,
    };
  }

  /**
   * Executes all the initialized tools on the compilation units.
   * @param cus Map of compilation units
   * @returns MistiResult containing tool outputs
   */
  private async executeTools(
    cus: Map<ProjectName, CompilationUnit>,
  ): Promise<MistiResultTool> {
    const toolOutputs = await Promise.all(
      Array.from(cus.values()).flatMap((cu) =>
        this.tools.map((tool) => {
          try {
            return tool.run(cu);
          } catch (error) {
            this.ctx.logger.error(`Error executing tool ${tool.id}: ${error}`);
            return null;
          }
        }),
      ),
    );
    return {
      kind: "tool",
      output: toolOutputs.filter(
        (output): output is ToolOutput => output !== null,
      ),
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
    if (this.outputFormat === "json") {
      let file = warn.loc.file;
      if (file && file.startsWith("/tmp/misti/temp-")) {
        file = file.replace(/^\/tmp\/misti\/temp-[^/]+\//, "");
      }
      const lc = warn.loc.interval.getLineAndColumn() as {
        lineNum: number;
        colNum: number;
      };
      return JSONbig.stringify({
        file,
        line: lc.lineNum,
        col: lc.colNum,
        detectorId: warn.detectorId,
        severity: severityToString(warn.severity, {
          colorize: false,
          brackets: false,
        }),
        message: warn.msg,
      });
    } else {
      const severity = severityToString(warn.severity, {
        colorize: this.colorizeOutput,
      });
      return `${severity} ${warn.detectorId}: ${warn.msg}${addNewline && !warn.msg.endsWith("\n") ? "\n" : ""}`;
    }
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
      tools: undefined,
      outputPath: undefined,
      outputFormat: undefined,
      colors: undefined,
      souffleBinary: undefined,
      soufflePath: undefined,
      souffleVerbose: undefined,
      tactStdlibPath: undefined,
      verbose: false,
      quiet: false,
      minSeverity: undefined,
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
      this.result = { kind: "error", error };
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
    if (options.allDetectors === true && options.detectors !== undefined) {
      throw ExecutionException.make(
        `--detectors and --all-detectors cannot be used simultaneously`,
      );
    }
    // Check for duplicate tool class names
    if (options.tools && options.tools.length > 0) {
      const toolClassNames = options.tools.map((tool) => tool.className);
      const uniqueClassNames = new Set(toolClassNames);
      if (toolClassNames.length !== uniqueClassNames.size) {
        const duplicates = toolClassNames.filter(
          (name, index) => toolClassNames.indexOf(name) !== index,
        );
        throw ExecutionException.make(
          `Duplicate tool class names found: ${duplicates.join(", ")}. Each tool must have a unique class name.`,
        );
      }
    }
  }
}
