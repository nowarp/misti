import { ExecutionException } from "./exceptions";
import { ILogger } from "@tact-lang/compiler/dist/logger";

export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR,
}

type MessageType = string | Error;

export type LogFunction = (message: string) => void;

/**
 * Provides a customizable logging mechanism across different levels of verbosity.
 */
export class Logger implements ILogger {
  private logFunctions: Map<LogLevel, LogFunction | undefined>;
  private jsonLogs: Map<LogLevel, string[]>;

  constructor(
    logMapping?: Partial<Record<LogLevel, LogFunction | undefined>>,
    private saveJson: boolean = false,
  ) {
    this.jsonLogs = new Map([
      [LogLevel.DEBUG, []],
      [LogLevel.INFO, []],
      [LogLevel.WARN, []],
      [LogLevel.ERROR, []],
    ]);
    const defaultLogFunctions = new Map([
      [LogLevel.DEBUG, undefined],
      [LogLevel.INFO, this.createLogFunction(console.log, LogLevel.INFO)],
      [LogLevel.WARN, this.createLogFunction(console.warn, LogLevel.WARN)],
      [LogLevel.ERROR, this.createLogFunction(console.error, LogLevel.ERROR)],
    ]);
    this.logFunctions = defaultLogFunctions;
    if (logMapping) {
      Object.entries(logMapping).forEach(([level, func]) => {
        const logLevel = Number(level) as LogLevel;
        this.logFunctions.set(
          logLevel,
          func ? this.createLogFunction(func, logLevel) : func,
        );
      });
    }
  }

  private createLogFunction(
    baseFunc: LogFunction,
    level: LogLevel,
  ): LogFunction {
    return (msg: string) => {
      if (this.saveJson) this.jsonLogs.get(level)?.push(msg);
      baseFunc(msg);
    };
  }

  public getJsonLogs(): Record<string, string[]> {
    if (!this.saveJson) {
      throw ExecutionException.make(
        "JSON logging not enabled for this logger instance",
      );
    }

    return {
      debug: this.jsonLogs.get(LogLevel.DEBUG) ?? [],
      info: this.jsonLogs.get(LogLevel.INFO) ?? [],
      warn: this.jsonLogs.get(LogLevel.WARN) ?? [],
      error: this.jsonLogs.get(LogLevel.ERROR) ?? [],
    };
  }

  /**
   * Logs a message at the specified log level if a corresponding log function is defined.
   * @param level The severity level of the log entry.
   * @param msg The content of the log message.
   * @param ref An optional source location.
   */
  protected log(level: LogLevel, msg: MessageType): void {
    const logFunction = this.logFunctions.get(level);
    if (logFunction) {
      logFunction(`${msg}`);
    }
  }

  debug(msg: MessageType): void {
    this.log(LogLevel.DEBUG, msg);
  }
  info(msg: MessageType): void {
    this.log(LogLevel.INFO, msg);
  }
  warn(msg: MessageType): void {
    this.log(LogLevel.WARN, msg);
  }
  error(msg: MessageType): void {
    this.log(LogLevel.ERROR, msg);
  }
}

/**
 * Logger that silences all logs.
 */
export class QuietLogger extends Logger {
  constructor(saveJson: boolean = false) {
    super(
      {
        [LogLevel.INFO]: undefined,
        [LogLevel.WARN]: undefined,
        [LogLevel.ERROR]: undefined,
      },
      saveJson,
    );
  }
}

/**
 * Logger that enables debug level logging to stdin.
 */
export class DebugLogger extends Logger {
  constructor(saveJson: boolean = false) {
    super(
      {
        [LogLevel.DEBUG]: console.log,
      },
      saveJson,
    );
  }
}

function trace(...args: any) {
  console.log(...args);
  console.trace();
}

/**
 * Logger that adds backtraces to each log function.
 */
export class TraceLogger extends Logger {
  constructor(saveJson: boolean = false) {
    super(
      {
        [LogLevel.DEBUG]: trace,
        [LogLevel.INFO]: trace,
        [LogLevel.WARN]: trace,
        [LogLevel.ERROR]: trace,
      },
      saveJson,
    );
  }
}
