"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugLogger = exports.QuietLogger = exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
/**
 * Provides a customizable logging mechanism across different levels of verbosity.
 */
class Logger {
    logFunctions;
    /**
     * Initializes logging functions for each log level, optionally overridden by provided mappings.
     * @param logMapping Optional mappings to override default log functions per level.
     */
    constructor(logMapping) {
        this.logFunctions = new Map([
            [LogLevel.DEBUG, undefined],
            [LogLevel.INFO, console.log],
            [LogLevel.WARN, console.log],
            [LogLevel.ERROR, console.error],
        ]);
        if (logMapping) {
            Object.entries(logMapping).forEach(([level, func]) => {
                this.logFunctions.set(Number(level), func);
            });
        }
    }
    /**
     * Logs a message at the specified log level if a corresponding log function is defined.
     * @param level The severity level of the log entry.
     * @param message The content of the log message.
     */
    log(level, message) {
        const logFunction = this.logFunctions.get(level);
        if (logFunction) {
            logFunction(message);
        }
    }
    debug(msg) {
        this.log(LogLevel.DEBUG, msg);
    }
    info(msg) {
        this.log(LogLevel.INFO, msg);
    }
    warn(msg) {
        this.log(LogLevel.WARN, msg);
    }
    error(msg) {
        this.log(LogLevel.ERROR, msg);
    }
}
exports.Logger = Logger;
/**
 * Logger that silences all logs.
 */
class QuietLogger extends Logger {
    constructor() {
        super({
            [LogLevel.INFO]: undefined,
            [LogLevel.WARN]: undefined,
            [LogLevel.ERROR]: undefined,
        });
    }
}
exports.QuietLogger = QuietLogger;
/**
 * Logger that enables debug level logging to stdin.
 */
class DebugLogger extends Logger {
    constructor() {
        super({
            [LogLevel.DEBUG]: console.log,
        });
    }
}
exports.DebugLogger = DebugLogger;
