import { MistiConfig } from "./config";
import { DebugLogger, Logger, QuietLogger, TraceLogger } from "./logger";
import { CLIOptions, cliOptionDefaults } from "../cli";
import { throwZodError } from "./exceptions";
import { TactConfigManager } from "./tact/config";
import { MistiTactPath, getActualPath, getProjectDirectory } from "../cli/path";
import { execSync } from "child_process";
import path from "path";

/**
 * Represents the context for a Misti run.
 */
export class MistiContext {
  logger: Logger;
  config: MistiConfig;

  /**
   * Indicates whether a Souffle binary is available.
   */
  readonly souffleAvailable: boolean;

  /**
   * Path to the Tact contract/configuration provided by the user.
   */
  readonly tactPath: MistiTactPath | undefined;

  /**
   * Initializes the context for Misti, setting up configuration and appropriate logger.
   */
  constructor(
    tactPath: MistiTactPath | undefined,
    options: CLIOptions = cliOptionDefaults,
  ) {
    this.tactPath = tactPath;
    this.souffleAvailable = this.checkSouffleInstallation(
      options.souffleBinary,
    );
    try {
      this.config = new MistiConfig({
        detectors: options.enabledDetectors,
        tools: options.tools,
        allDetectors: options.allDetectors,
        configPath: options.config,
      });
    } catch (err) {
      throwZodError(err, {
        msg: `Error parsing Misti Configuration${options.config ? " " + options.config : ""}`,
        help: "See: https://nowarp.io/tools/misti/docs/tutorial/configuration/",
      });
    }

    // Prioritize CLI options to configuration file values
    this.config.soufflePath = options.soufflePath;
    this.config.souffleVerbose = options.souffleVerbose;
    if (options.tactStdlibPath !== undefined) {
      this.config.tactStdlibPath = options.tactStdlibPath;
    }

    // Set logger based on verbosity options
    this.logger = options.verbose
      ? new DebugLogger()
      : options.quiet
        ? new QuietLogger()
        : this.config.verbosity === "quiet"
          ? new QuietLogger()
          : this.config.verbosity === "debug"
            ? new DebugLogger()
            : new Logger();

    // Add backtraces to the logger output if requested
    if (process.env.MISTI_TRACE === "1") {
      this.logger = new TraceLogger();
    }
  }

  /**
   * Checks whether the Souffle binary is available.
   */
  private checkSouffleInstallation(souffleBinary: string): boolean {
    try {
      execSync(`${souffleBinary} --version`, { stdio: "ignore" });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Returns entry points taking into account the user's configuration.
   *
   * @returns Absolute paths to entrypoint files.
   */
  public getEntryPoints(): string[] {
    if (this.tactPath === undefined) {
      return [];
    }
    const configPath = getActualPath(this.tactPath);
    const projectDir = getProjectDirectory(this.tactPath);
    const configManager = new TactConfigManager(this, configPath);
    return configManager.config.projects.map((project) =>
      path.resolve(projectDir, project.path),
    );
  }
}
