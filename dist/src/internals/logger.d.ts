export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}
export type LogFunction = (message: string) => void;
/**
 * Provides a customizable logging mechanism across different levels of verbosity.
 */
export declare class Logger {
    private logFunctions;
    /**
     * Initializes logging functions for each log level, optionally overridden by provided mappings.
     * @param logMapping Optional mappings to override default log functions per level.
     */
    constructor(logMapping?: Partial<Record<LogLevel, LogFunction | undefined>>);
    /**
     * Logs a message at the specified log level if a corresponding log function is defined.
     * @param level The severity level of the log entry.
     * @param message The content of the log message.
     */
    protected log(level: LogLevel, message: string): void;
    debug(msg: string): void;
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
}
/**
 * Logger that silences all logs.
 */
export declare class QuietLogger extends Logger {
    constructor();
}
/**
 * Logger that enables debug level logging to stdin.
 */
export declare class DebugLogger extends Logger {
    constructor();
}
