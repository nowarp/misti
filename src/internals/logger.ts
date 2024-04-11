export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR,
}

export type LogFunction = (message: string) => void;

/**
 * Provides a customizable logging mechanism across different levels of verbosity.
 */
export class Logger {
  private logFunctions: Map<LogLevel, LogFunction | undefined>;

  /**
   * Initializes logging functions for each log level, optionally overridden by provided mappings.
   * @param logMapping Optional mappings to override default log functions per level.
   */
  constructor(logMapping?: Partial<Record<LogLevel, LogFunction | undefined>>) {
    this.logFunctions = new Map([
      [LogLevel.DEBUG, undefined],
      [LogLevel.INFO, console.log],
      [LogLevel.WARN, console.log],
      [LogLevel.ERROR, console.error],
    ]);
    if (logMapping) {
      Object.entries(logMapping).forEach(([level, func]) => {
        this.logFunctions.set(Number(level) as LogLevel, func);
      });
    }
  }

  /**
   * Logs a message at the specified log level if a corresponding log function is defined.
   * @param level The severity level of the log entry.
   * @param message The content of the log message.
   */
  protected log(level: LogLevel, message: string): void {
    const logFunction = this.logFunctions.get(level);
    if (logFunction) {
      logFunction(message);
    }
  }

  debug(msg: string) {
    this.log(LogLevel.DEBUG, msg);
  }
  info(msg: string) {
    this.log(LogLevel.INFO, msg);
  }
  warn(msg: string) {
    this.log(LogLevel.WARN, msg);
  }
  error(msg: string) {
    this.log(LogLevel.ERROR, msg);
  }
}

/**
 * Logger that silences all logs.
 */
export class QuietLogger extends Logger {
  constructor() {
    super({
      [LogLevel.INFO]: undefined,
      [LogLevel.WARN]: undefined,
      [LogLevel.ERROR]: undefined,
    });
  }
}

/**
 * Logger that enables debug level logging to stdin.
 */
export class DebugLogger extends Logger {
  constructor() {
    super({
      [LogLevel.DEBUG]: console.log,
    });
  }
}
