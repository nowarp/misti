import { Logger, QuietLogger, DebugLogger, TraceLogger } from "./logger";
import { MistiConfig } from "./config";

/**
 * Represents the context for a Misti run.
 */
export class MistiContext {
  logger: Logger;
  config: MistiConfig;

  /**
   * Initializes the context for Misti, setting up configuration and appropriate logger.
   * @param mistiConfigPath Path to the Misti configuration file.
   * @param soufflePath Directory to save Soufflé files.
   * @param verbose CLI option to force verbose output.
   * @param quiet CLI option to forcefuly suppress output.
   */
  constructor(
    mistiConfigPath?: string,
    soufflePath?: string,
    verbose?: boolean,
    quiet?: boolean,
  ) {
    this.config = new MistiConfig(mistiConfigPath);

    // Prioritize CLI options for Soufflé
    if (soufflePath) {
      this.config.soufflePath = soufflePath;
    }

    // Prioritize CLI options for verbosity
    if (verbose === true) {
      this.logger = new DebugLogger();
    } else if (quiet === true) {
      this.logger = new QuietLogger();
    } else {
      if (this.config.verbosity == "quiet") {
        this.logger = new QuietLogger();
      } else if (this.config.verbosity == "debug") {
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
}
