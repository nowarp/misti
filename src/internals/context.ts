import { Logger, QuietLogger, DebugLogger, TraceLogger } from "./logger";
import { MistiConfig } from "./config";

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
   * @param params Contains various configuration options:
   *   - mistiConfigPath: Path to the Misti configuration file.
   *   - soufflePath: Directory to save Soufflé files.
   *   - tactStdlibPath: Non-default path to Tact stdlib.
   *   - verbose: CLI option to force verbose output.
   *   - quiet: CLI option to forcefully suppress output.
   *   - quiet: CLI option to forcefully activate all the available built-in detectors.
   *   - detectors: Detectors to run that will override those specified in the configuration file if set.
   *   - allDetectors: Enable all the available built-in detectors no matter if they are enabled in config.
   *   - singleContractPath: Contains path to a single contract if executed without project configuration.
   *   - souffleAvailable: Indicates whether a Souffle binary is available..
   */
  constructor(
    params: Partial<{
      mistiConfigPath?: string;
      soufflePath?: string;
      tactStdlibPath?: string;
      verbose?: boolean;
      quiet?: boolean;
      detectors?: string[];
      allDetectors?: boolean;
      singleContractPath?: string;
      souffleAvailable?: boolean;
    }> = {},
  ) {
    const {
      mistiConfigPath = undefined,
      soufflePath = undefined,
      tactStdlibPath = undefined,
      verbose = false,
      quiet = false,
      detectors = undefined,
      allDetectors = false,
      singleContractPath: singleContractPath,
      souffleAvailable = false,
    } = params;
    this.singleContractPath = singleContractPath;
    this.souffleAvailable = souffleAvailable;
    this.config = new MistiConfig({
      detectors,
      allDetectors,
      configPath: mistiConfigPath,
    });

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
