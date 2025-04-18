import { MistiConfig, MistiEnv } from "./config";
import { DebugLogger, Logger, QuietLogger, TraceLogger } from "./logger";
import { CLIOptions, cliOptionDefaults } from "../cli";
import { throwZodError } from "./exceptions";
import { execSync } from "child_process";

/**
 * Represents the context for a Misti run.
 */
export class MistiContext {
  public logger: Logger;
  public config: MistiConfig;

  /**
   * Indicates whether a Souffle binary is available.
   */
  readonly souffleAvailable: boolean;

  /**
   * Initializes the context for Misti, setting up configuration and appropriate logger.
   */
  constructor(options: CLIOptions = cliOptionDefaults) {
    this.souffleAvailable = options.souffle
      ? this.checkSouffleInstallation(options.souffleBinary)
      : false;

    try {
      this.config = new MistiConfig({
        detectors: options.enabledDetectors,
        tools: options.tools,
        allDetectors: options.allDetectors,
        configPath: options.config,
        fs: options.fs,
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
    const saveJson = options.outputFormat === "json";
    if (MistiEnv.MISTI_TRACE) {
      this.logger = new TraceLogger(saveJson);
    } else {
      this.logger = options.verbose
        ? new DebugLogger(saveJson, true)
        : options.quiet
          ? new QuietLogger(saveJson)
          : this.config.verbosity === "quiet"
            ? new QuietLogger(saveJson)
            : this.config.verbosity === "debug"
              ? new DebugLogger(saveJson)
              : new Logger(undefined, saveJson);
    }
  }

  /**
   * Checks whether the Souffle binary is available.
   */
  private checkSouffleInstallation(souffleBinary: string): boolean {
    try {
      execSync(`${souffleBinary} --version`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}
