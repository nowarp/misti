import { ASTRef } from "@tact-lang/compiler/dist/grammar/ast";
import * as path from "path";

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
   * @param msg The content of the log message.
   * @param ref An optional source location.
   */
  protected log(level: LogLevel, msg: string, ref?: ASTRef): void {
    const logFunction = this.logFunctions.get(level);
    if (logFunction) {
      logFunction(`${this.formatPosition(ref)}\n${msg}`);
    }
  }

  debug(msg: string, ref?: ASTRef) {
    this.log(LogLevel.DEBUG, msg, ref);
  }
  info(msg: string, ref?: ASTRef) {
    this.log(LogLevel.INFO, msg, ref);
  }
  warn(msg: string, ref?: ASTRef) {
    this.log(LogLevel.WARN, msg, ref);
  }
  error(msg: string, ref?: ASTRef) {
    this.log(LogLevel.ERROR, msg, ref);
  }

  private formatPosition(ref?: ASTRef): string {
    if (!ref || !ref.file) {
      return "";
    }
    const relativeFilePath = path.relative(process.cwd(), ref.file);
    const lc = ref.interval.getLineAndColumn();
    return `${relativeFilePath}: ${lc}`;
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

function trace(...args: any) {
  console.log(...args);
  console.trace();
}

/**
 * Logger that adds backtraces to each log function.
 */
export class TraceLogger extends Logger {
  constructor() {
    super({
      [LogLevel.DEBUG]: trace,
      [LogLevel.INFO]: trace,
      [LogLevel.WARN]: trace,
      [LogLevel.ERROR]: trace,
    });
  }
}
