import { MistiConfig } from "./config";
import { DebugLogger, Logger, QuietLogger, TraceLogger } from "./logger";
import { CLIOptions, cliOptionDefaults } from "../cli";
import { throwZodError } from "./exceptions";
import { execSync } from "child_process";

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
   * Initializes the context for Misti, setting up configuration and appropriate logger.
   */
  constructor(options: CLIOptions = cliOptionDefaults) {
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
}
