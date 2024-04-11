import { Logger, QuietLogger, DebugLogger } from "./logger";
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
   */
  constructor(mistiConfigPath?: string) {
    this.config = new MistiConfig(mistiConfigPath);

    if (this.config.verbosity == "quiet") {
      this.logger = new QuietLogger();
    } else if (this.config.verbosity == "debug") {
      this.logger = new DebugLogger();
    } else {
      this.logger = new Logger();
    }
  }
}
