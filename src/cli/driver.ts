import { CLIOptions, cliOptionDefaults } from "./options";
import { Result, ToolOutput } from "./result";
import { OutputFormat } from "./types";
import { Detector, findBuiltInDetector } from "../detectors/detector";
import { MistiEnv, WarningSuppression } from "../internals/config";
import { MistiContext } from "../internals/context";
import { ExecutionException, InternalException } from "../internals/exceptions";
import { CompilationUnit, ImportGraph, ProjectName } from "../internals/ir";
import { createIR } from "../internals/ir/builders/";
import { ImportGraphBuilder } from "../internals/ir/builders/imports";
import { Logger } from "../internals/logger";
import { TactConfigManager, parseTactProject } from "../internals/tact";
import { isBrowser, isTest, unreachable } from "../internals/util";
import { Warning, Severity, hashWarning } from "../internals/warnings";
import { Tool, findBuiltInTool } from "../tools/tool";
import { VirtualFileSystem } from "../vfs/virtualFileSystem";
import ignore from "ignore";
import JSONbig from "json-bigint";
import path from "path";

/**
 * Manages the initialization and execution of detectors for analyzing compilation units.
 */
export class Driver {
  ctx: MistiContext;
  detectors: Detector[] = [];
  tools: Tool<any>[] = [];
  outputPath: string;
  /** List of detectors explicitly disabled by the user. */
  disabledDetectors: Set<string>;
  colorizeOutput: boolean;
  fs: VirtualFileSystem;
  /**
   * Compilation units representing the actual entrypoints of the analysis targets
   * based on user's input. Might be empty if no paths are specified.
   */
  cus: Map<ProjectName, CompilationUnit>;
  /** Minimum severity level to report warnings. */
  minSeverity: Severity;
  outputFormat: OutputFormat;

  private constructor(tactPaths: string[], options: CLIOptions) {
    this.fs = options.fs;
    this.ctx = new MistiContext(options);
    this.cus = this.createCUs(tactPaths);
    this.disabledDetectors = new Set(options.disabledDetectors ?? []);
    this.colorizeOutput = options.colors;
    this.minSeverity = options.minSeverity;
    this.outputFormat = options.outputFormat;
    this.outputPath = options.outputPath;
  }

  /**
   * Asynchronously creates a driver initializing all detectors.
   * @param tactPath Path to the Tact project configuration of to a single Tact contract.
   */
  public static async create(
    tactPaths: string[],
    options: Partial<CLIOptions> = {},
  ): Promise<Driver> {
    const mergedOptions: CLIOptions = { ...cliOptionDefaults, ...options };
    this.checkCLIOptions(mergedOptions);
    const driver = new Driver(tactPaths, mergedOptions);
    await driver.initializeDetectors();
    await driver.initializeTools();
    if (mergedOptions.souffle && !driver.ctx.souffleAvailable) {
      this.warnOnDisabledDetectors(driver);
    }
    return driver;
  }

  /**
   * Resolves the filepaths provided as an input to Misti to initialize the
   * compilation units which are IR entries to target analysis on.
   *
   * @param tactPaths Paths received from the user.
   * @returns Created compilation units.
   */
  private createCUs(tactPaths: string[]): Map<ProjectName, CompilationUnit> {
    return [...new Set(tactPaths)]
      .reduce((acc, tactPath) => {
        if (this.fs.stat(tactPath).isDirectory()) {
          const tactFiles = this.collectTactFiles(tactPath);
          this.ctx.logger.debug(
            `Collected Tact files from ${tactPath}:\n${tactFiles.map((tactFile) => "- " + tactFile).join("\n")}`,
          );
          acc.push(...tactFiles);
        } else {
          acc.push(tactPath);
        }
        return acc;
      }, [] as string[])
      .filter(
        (tactPath) =>
          this.fs.exists(tactPath) ||
          (this.ctx.logger.error(`${tactPath} is not available`), false),
      )
      .reduce((acc, tactPath) => {
        // TODO: Check on the available import graphs if some of the inputs are already added
        let importGraph: ImportGraph;
        let configManager: TactConfigManager;
        if (tactPath.endsWith(".tact")) {
          importGraph = ImportGraphBuilder.make(this.ctx, [tactPath]).build();
          let projectRoot = importGraph.resolveProjectRoot(this.fs);
          if (projectRoot === undefined) {
            projectRoot = path.dirname(tactPath);
            this.ctx.logger.warn(
              `Cannot resolve project path. Trying ${projectRoot}`,
            );
          }
          const projectName = path.basename(tactPath, ".tact") as ProjectName;
          // TODO: Try to merge them into one of the existing configs.
          configManager = TactConfigManager.fromContract(
            projectRoot,
            tactPath,
            projectName,
            this.fs,
          );
          const projectConfig = configManager.findProjectByName(projectName);
          if (projectConfig === undefined) {
            throw InternalException.make(
              [
                `Cannot find ${projectName} in the configuration file generated for ${tactPath}:`,
                JSON.stringify(configManager.getConfig, null, 2),
              ].join("\n"),
            );
          }
          const ast = parseTactProject(
            this.ctx,
            projectConfig,
            projectRoot,
            this.fs,
          );
          const cu = createIR(this.ctx, projectName, ast, importGraph);
          acc.set(projectName, cu);
        } else {
          // Tact configuration file
          configManager = TactConfigManager.fromConfig(tactPath);
          importGraph = ImportGraphBuilder.make(
            this.ctx,
            configManager.getEntryPoints(),
          ).build();
          configManager.getProjects().forEach((configProject) => {
            const ast = parseTactProject(
              this.ctx,
              configProject,
              configManager.getProjectRoot(),
              this.fs,
            );
            const projectName = configProject.name as ProjectName;
            const cu = createIR(this.ctx, projectName, ast, importGraph);
            acc.set(projectName, cu);
          });
        }
        return acc;
      }, new Map<ProjectName, CompilationUnit>());
  }

  /**
   * Collects all the .tact files in the given directory with respect to ignore heuristics.
   * @param dir The directory to search in.
   * @returns The list of .tact files.
   */
  private collectTactFiles(dir: string): string[] {
    let results: string[] = [];
    const files = this.fs.readdir(dir);

    // If .gitignore exists, use it to ignore files
    const gitignorePath = findGitignore(dir, this.fs);
    let ig = ignore();
    if (gitignorePath) {
      ig = ignore().add(this.fs.readFile(gitignorePath).toString("utf8"));
    }

    files.forEach((file) => {
      const fullPath = path.join(dir, file);
      const relativePath = path.relative(dir, fullPath);
      if (!ig.ignores(relativePath) && !fullPath.includes("node_modules")) {
        if (this.fs.stat(fullPath).isDirectory()) {
          results = results.concat(this.collectTactFiles(fullPath));
        } else if (file.endsWith(".tact")) {
          results.push(fullPath);
        }
      }
    });
    return results;
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
    if (
      options.allDetectors === true &&
      options.enabledDetectors !== undefined
    ) {
      throw ExecutionException.make(
        `--enabled-detectors and --all-detectors cannot be used simultaneously`,
      );
    }
    // Prevent multiple tools with plain output format
    if (
      options.tools &&
      options.tools.length > 1 &&
      options.outputFormat === "plain"
    ) {
      throw ExecutionException.make(
        `Cannot execute multiple tools with --output-format "plain". Use --output-format "json" for multiple tools.`,
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
    // Check for intersection between enabledDetectors and disabledDetectors
    if (options.enabledDetectors && options.disabledDetectors) {
      const enabledSet = new Set(options.enabledDetectors);
      const disabledSet = new Set(options.disabledDetectors);
      const intersection = [...enabledSet].filter((x) => disabledSet.has(x));
      if (intersection.length > 0) {
        throw ExecutionException.make(
          `Detectors cannot be both enabled and disabled. Conflicting detectors: ${intersection.join(", ")}`,
        );
      }
    }
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
      Promise<Detector | null>[]
    >((acc, config) => {
      if (this.disabledDetectors.has(config.className)) {
        this.ctx.logger.debug(`Suppressed detector: ${config.className}`);
        return acc;
      }
      acc.push(
        (async () => {
          let detector: Detector | null;
          if (config.modulePath) {
            detector = await this.loadExternalDetector({
              modulePath: config.modulePath,
              className: config.className,
            });
          } else {
            detector = await this.loadBuiltInDetector({
              className: config.className,
            });
          }

          if (
            detector &&
            !this.checkDetectorSeverity(detector, config.className)
          ) {
            return null;
          }

          return detector;
        })(),
      );
      return acc;
    }, []);
    this.detectors = (await Promise.all(detectorPromises)).filter(
      (detector): detector is Detector => detector !== null,
    );
    this.ctx.logger.debug(
      `Enabled detectors (${this.detectors.length}): ${this.detectors.map((d) => d.id).join(", ")}`,
    );
  }

  /**
   * Loads an external detector from a module path.
   * @param config The detector configuration
   * @returns The detector instance or null if loading failed
   */
  private async loadExternalDetector(config: {
    modulePath: string;
    className: string;
  }): Promise<Detector | null> {
    let DetectorClass;
    let module;
    try {
      const absolutePath = path.resolve(config.modulePath);
      const relativePath = path.relative(__dirname, absolutePath);
      module = await import(
        relativePath.replace(path.extname(relativePath), "")
      );
      DetectorClass = module[config.className];
    } catch (error) {
      this.ctx.logger.error(`Failed to import module: ${config.modulePath}`);
      this.ctx.logger.error(`${error}`);
      return null;
    }
    if (!DetectorClass) {
      throw ExecutionException.make(
        `Detector class ${config.className} not found in module ${config.modulePath}`,
      );
    }
    return new DetectorClass(this.ctx) as Detector;
  }

  /**
   * Loads a built-in detector.
   * @param config The detector configuration
   * @returns The detector instance or null if not found
   */
  private async loadBuiltInDetector(config: {
    className: string;
  }): Promise<Detector | null> {
    const detector = await findBuiltInDetector(this.ctx, config.className);
    if (!detector) {
      throw ExecutionException.make(
        `Built-in detector ${config.className} not found`,
      );
    }
    return detector;
  }

  /**
   * Checks if detector's severity meets the minimum severity requirement.
   * @param detector The detector to check
   * @param className The detector class name for logging
   * @returns True if detector should be used, false if it should be skipped
   */
  private checkDetectorSeverity(
    detector: Detector,
    className: string,
  ): boolean {
    if (detector.getSeverity().max < this.minSeverity) {
      this.ctx.logger.debug(
        `Skipping detector ${className} - max severity ${detector.getSeverity().max} < min severity ${this.minSeverity}`,
      );
      return false;
    }
    return true;
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
   * Actual implementation of the entry point.
   */
  public async executeImpl(): Promise<Result> {
    if (this.detectors.length === 0 && this.tools.length === 0) {
      this.ctx.logger.warn(
        "Nothing to execute. Please specify at least one detector or tool.",
      );
      return { kind: "ok" };
    }
    try {
      return this.tools.length > 0
        ? await this.executeTools()
        : await this.executeAnalysis();
    } catch (err) {
      const result = [] as string[];
      if (err instanceof Error) {
        result.push(err.message);
        if (err.stack !== undefined && MistiEnv.MISTI_TRACE) {
          result.push(err.stack);
        }
      } else {
        result.push(`An error occurred:\n${JSONbig.stringify(err)}`);
      }
      const error = result.join("\n");
      new Logger().error(error);
      return { kind: "error", error };
    }
  }

  /**
   * Wraps the entry point of execution with extra logging handling logic.
   */
  public async execute(): Promise<Result> {
    const result = await this.executeImpl();
    if (this.outputFormat === "json") {
      return {
        ...result,
        logs: this.ctx.logger.getJsonLogs(),
      };
    }
    return result;
  }

  /**
   * Executes all the initialized detectors on the compilation units.
   * @param cus Map of compilation units
   * @returns MistiResult containing detectors output
   */
  private async executeAnalysis(): Promise<Result> {
    const allWarnings = await (async () => {
      const warningsMap = new Map<ProjectName, Warning[]>();
      await Promise.all(
        Array.from(this.cus.entries()).map(async ([projectName, cu]) => {
          const warnings = await this.checkCU(cu);
          warningsMap.set(projectName, warnings);
        }),
      );
      return warningsMap;
    })();
    const filteredWarnings: Map<ProjectName, Warning[]> =
      this.filterImportedWarnings(Array.from(this.cus.keys()), allWarnings);
    this.filterSuppressedWarnings(filteredWarnings);
    const reported = new Set<string>();
    let foundWarnings = false;
    const warnings: Warning[] = [];
    for (const [_, projectWarnings] of filteredWarnings.entries()) {
      projectWarnings.forEach((warn) => {
        const hash = hashWarning(warn);
        if (!reported.has(hash) && warn.severity >= this.minSeverity) {
          warnings.push(warn);
          foundWarnings = true;
          reported.add(hash);
        }
      });
    }
    warnings.sort((a, b) => b.severity - a.severity);
    return foundWarnings
      ? {
          kind: "warnings",
          warnings,
        }
      : { kind: "ok" };
  }

  /**
   * Executes all the initialized tools on the compilation units.
   * @returns MistiResult containing tool outputs
   */
  private async executeTools(): Promise<Result> {
    const noInputFiles = this.cus.size === 0;
    const standaloneTools = this.tools.filter((tool) =>
      Tool.canRunStandalone(tool),
    );
    const cuDependentTools = this.tools.filter((tool) => {
      if (noInputFiles) {
        this.ctx.logger.warn(
          `${tool.id} requires an input file to be executed`,
        );
      }
      return !Tool.canRunStandalone(tool);
    });
    if (noInputFiles && standaloneTools.length === 0) {
      this.ctx.logger.warn("Nothing to execute");
      return { kind: "ok" };
    }
    const standaloneOutputs = await Promise.all(
      standaloneTools.map((tool) => {
        try {
          return tool.runStandalone();
        } catch (error) {
          this.ctx.logger.error(
            `Error executing standalone tool ${tool.id}: ${error}`,
          );
          return null;
        }
      }),
    );
    const cuOutputs = await Promise.all(
      Array.from(this.cus.values()).flatMap((cu) =>
        cuDependentTools.map((tool) => {
          try {
            return tool.run(cu);
          } catch (error) {
            this.ctx.logger.error(`Error executing tool ${tool.id}: ${error}`);
            return null;
          }
        }),
      ),
    );
    const allOutputs = [...standaloneOutputs, ...cuOutputs];
    return {
      kind: "tool",
      output: allOutputs.filter(
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
    allWarnings: Map<ProjectName, Warning[]>,
  ): Map<ProjectName, Warning[]> {
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
      warnings.forEach((warn) => {
        const hash = hashWarning(warn);
        if (!warningsMap.has(hash)) {
          warningsMap.set(hash, []);
        }
        warningsMap.get(hash)!.push(projectName);
      });
    });

    const filteredWarnings: Map<ProjectName, Warning[]> = new Map();
    for (const [projectName, warnings] of allWarnings) {
      const projectWarnings: Warning[] = [];
      for (const warn of warnings) {
        const behavior = this.findDetector(
          warn.detectorId,
        ).shareImportedWarnings;
        switch (behavior) {
          case "intersect":
            // The warning must be raised in all the projects.
            const projects = warningsMap.get(hashWarning(warn))!;
            if (
              new Set(allProjectNames).size === new Set(projects).size &&
              [...new Set(allProjectNames)].every((value) =>
                new Set(projects).has(value as ProjectName),
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
            unreachable(behavior);
        }
      }
      filteredWarnings.set(projectName, projectWarnings);
    }

    return filteredWarnings;
  }

  /**
   * Filters out the suppressed warnings.
   * Mutates the input map removing suppressed warnings.
   */
  private filterSuppressedWarnings(
    warnings: Map<ProjectName, Warning[]>,
  ): void {
    this.filterSuppressedInAnnotations(warnings);
    this.filterSuppressedInConfig(warnings);
  }

  /**
   * Filters out the warnings suppressed in the code annotations.
   * Mutates the input map removing suppressed warnings.
   */
  private filterSuppressedInAnnotations(
    warnings: Map<ProjectName, Warning[]>,
  ): void {
    warnings.forEach((projectWarnings, projectName) => {
      const filteredWarnings = projectWarnings.filter(
        (warning) => !warning.suppressed,
      );
      warnings.set(projectName, filteredWarnings);
    });
  }

  /**
   * Compares suppressionFile and warningFile.
   * If suppressionFile is an absolute path, returns true if the files are the same after normalization.
   * If suppressionFile is relative, returns true if warningFile ends with the normalized relative path.
   */
  private pathsAreEqual(suppressionFile: string, warningFile: string): boolean {
    const normalizedWarningFile = path.normalize(warningFile);
    const normalizedSuppressionFile = path.normalize(suppressionFile);
    // Special handling for test environments
    if (isTest() && !path.isAbsolute(warningFile)) {
      const absoluteWarningFile = path.join(
        process.cwd(),
        normalizedWarningFile,
      );
      return this.pathsAreEqual(suppressionFile, absoluteWarningFile);
    }
    return path.isAbsolute(suppressionFile)
      ? normalizedWarningFile === normalizedSuppressionFile
      : normalizedWarningFile.endsWith(normalizedSuppressionFile);
  }

  /**
   * Checks if a warning matches suppression.
   */
  private suppressionMatchesWarning(
    suppression: WarningSuppression,
    warning: Warning,
  ): boolean {
    if (!warning.location.file) return false;
    if (
      warning.location.line !== suppression.line ||
      warning.location.column !== suppression.col
    ) {
      return false;
    }
    return this.pathsAreEqual(suppression.file, warning.location.file);
  }

  /**
   * Filters warnings suppressed in the config file.
   * Mutates the input map, removing suppressed warnings.
   */
  private filterSuppressedInConfig(
    warnings: Map<ProjectName, Warning[]>,
  ): void {
    this.ctx.config.suppressions.forEach((suppression) => {
      let suppressionUsed = false;
      warnings.forEach((projectWarnings, projectName) => {
        const filteredWarnings = projectWarnings.filter((warning) => {
          if (this.suppressionMatchesWarning(suppression, warning)) {
            suppressionUsed = true;
            return false;
          }
          return true;
        });
        warnings.set(projectName, filteredWarnings);
      });
      if (!suppressionUsed) {
        this.ctx.logger.warn(
          `Unused suppression: ${suppression.detector} at ${suppression.file}:${suppression.line}:${suppression.col}`,
        );
      }
    });
  }

  /**
   * Executes all detectors on a given compilation unit and collects any warnings found.
   * @param cu The compilation unit to check.
   * @returns Warnings generated by each of detectors.
   */
  private async checkCU(cu: CompilationUnit): Promise<Warning[]> {
    const warningsPromises = this.detectors.map(async (detector) => {
      if (!this.ctx.souffleAvailable && detector.usesSouffle) {
        this.ctx.logger.debug(
          `${cu.projectName}: Skipping ${detector.id} since no Soufflé installation is available`,
        );
        return [];
      }
      return this.ctx.logger.withContext(`${detector.id}:${cu.projectName}`)(
        async () => {
          if (!isTest())
            this.ctx.logger.debug(`Running detector for ${cu.projectName}`);
          try {
            // Conditional import for setTimeout to support both Node.js and browser environments
            let setTimeoutPromise: (ms: number, value?: any) => Promise<any>;
            if (isBrowser()) {
              setTimeoutPromise = (ms) =>
                new Promise((resolve) => setTimeout(resolve, ms));
            } else {
              setTimeoutPromise = (await import("timers/promises")).setTimeout;
            }
            const warnings = await Promise.race([
              detector.check(cu),
              setTimeoutPromise(MistiEnv.MISTI_TIMEOUT, []).then(() => {
                throw new Error(
                  `Detector ${detector.id} timed out after ${MistiEnv.MISTI_TIMEOUT}ms`,
                );
              }),
            ]);
            if (!isTest()) this.ctx.logger.debug(`Finished detector`);
            return warnings;
          } catch (err) {
            let error: string = "";
            if (err instanceof Error) {
              const result = [] as string[];
              result.push(err.message);
              if (
                err.stack !== undefined &&
                this.ctx.config.verbosity === "debug"
              ) {
                result.push(err.stack);
              }
              error = result.join("\n");
            } else {
              error = `${err}`;
            }
            this.ctx.logger.error(`Error in detector: ${error}`);
            return [];
          }
        },
      );
    });
    try {
      return (
        await Promise.all(warningsPromises as Promise<Warning[]>[])
      ).flat();
    } catch (error) {
      throw InternalException.make(
        `${cu.projectName} execution error:\n${error}`,
      );
    }
  }
}

/**
 * Finds the .gitignore file in the given directory or any of its parent directories.
 * @param startDir The directory to start searching from.
 * @returns The path to the .gitignore file or null if not found.
 */
function findGitignore(startDir: string, fs: VirtualFileSystem): string | null {
  let currentDir = startDir;
  while (currentDir !== path.parse(currentDir).root) {
    const gitignorePath = path.join(currentDir, ".gitignore");
    if (fs.exists(gitignorePath)) {
      return gitignorePath;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}
