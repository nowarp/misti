import { MistiConfig } from "./config";
import { DebugLogger, Logger, QuietLogger, TraceLogger } from "./logger";
import { CLIOptions } from "../cli";
import { execSync } from "child_process";

/**
 * Represents the context for a Misti run.
 */
export class MistiContext {
  logger: Logger;
  config: MistiConfig;
  /** Indicates whether a Souffle binary is available. */
  readonly souffleAvailable: boolean;
  /** Path to a single Tact contract if executed without project config. */
  readonly singleContractPath: string | undefined;

  /**
   * Initializes the context for Misti, setting up configuration and appropriate logger.
   */
  constructor(tactPath: string, options: CLIOptions) {
    this.singleContractPath = tactPath.endsWith(".tact") ? tactPath : undefined;
    this.souffleAvailable = this.checkSouffleInstallation(
      options.souffleBinary ?? "souffle",
    );
    this.config = new MistiConfig({
      detectors: options.detectors,
      tools: options.tools,
      allDetectors: options.allDetectors,
      configPath: options.config,
    });

    // Prioritize CLI options to configuration file values
    if (options.soufflePath !== undefined) {
      this.config.soufflePath = options.soufflePath;
    }
    if (options.souffleVerbose !== undefined) {
      this.config.souffleVerbose = options.souffleVerbose;
    }
    if (options.tactStdlibPath !== undefined) {
      this.config.tactStdlibPath = options.tactStdlibPath;
    }

    // Prioritize CLI options for verbosity
    if (options.verbose === true) {
      this.logger = new DebugLogger();
    } else if (options.quiet === true) {
      this.logger = new QuietLogger();
    } else {
      if (this.config.verbosity === "quiet") {
        this.logger = new QuietLogger();
      } else if (this.config.verbosity === "debug") {
        this.logger = new DebugLogger();
      } else {
        this.logger = new Logger();
      }
    }

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
