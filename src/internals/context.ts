import { Logger, QuietLogger, DebugLogger, TraceLogger } from "./logger";
import { MistiConfig } from "./config";

/**
 * Represents the context for a Misti run.
 */
export class MistiContext {
  logger: Logger;
  config: MistiConfig;
  /** Path to a single Tact contract if executed without project config. */
  readonly singleContractPath: string | undefined;

  /**
   * Initializes the context for Misti, setting up configuration and appropriate logger.
   * @param params Contains various configuration options:
   *   - mistiConfigPath: Path to the Misti configuration file.
   *   - soufflePath: Directory to save Soufflé files.
   *   - tactStdlibPath: Non-default path to Tact stdlib.
   *   - verbose: CLI option to force verbose output.
   *   - quiet: CLI option to forcefully suppress output.
   *   - singleContractPath: Contains path to a single contract if executed without project configuration.
   */
  constructor(
    params: Partial<{
      mistiConfigPath?: string;
      soufflePath?: string;
      tactStdlibPath?: string;
      verbose?: boolean;
      quiet?: boolean;
      singleContractPath?: string;
    }> = {},
  ) {
    const {
      mistiConfigPath = undefined,
      soufflePath = undefined,
      tactStdlibPath = undefined,
      verbose = false,
      quiet = false,
      singleContractPath: singleContractPath,
    } = params;
    this.singleContractPath = singleContractPath;
    this.config = new MistiConfig(mistiConfigPath);

    // Prioritize CLI options to configuration file values
    if (soufflePath !== undefined) {
      this.config.soufflePath = soufflePath;
    }
    if (tactStdlibPath !== undefined) {
      this.config.tactStdlibPath = tactStdlibPath;
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
