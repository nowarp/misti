"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MistiContext = void 0;
const logger_1 = require("./logger");
const config_1 = require("./config");
/**
 * Represents the context for a Misti run.
 */
class MistiContext {
    logger;
    config;
    /**
     * Initializes the context for Misti, setting up configuration and appropriate logger.
     * @param mistiConfigPath Path to the Misti configuration file.
     */
    constructor(mistiConfigPath) {
        this.config = new config_1.MistiConfig(mistiConfigPath);
        if (this.config.verbosity == "quiet") {
            this.logger = new logger_1.QuietLogger();
        }
        else if (this.config.verbosity == "debug") {
            this.logger = new logger_1.DebugLogger();
        }
        else {
            this.logger = new logger_1.Logger();
        }
    }
}
exports.MistiContext = MistiContext;
