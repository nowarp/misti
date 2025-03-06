import { ExecutionException } from "./exceptions";

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
export class Logger {
  private logFunctions: Map<LogLevel, LogFunction | undefined>;
  private jsonLogs: Map<LogLevel, string[]>;
  private contextMap: Map<string, string> = new Map();
  private static asyncLocalStorage = new Map<number, string>();
  private showTimestamps: boolean;

  constructor(
    logMapping?: Partial<Record<LogLevel, LogFunction | undefined>>,
    private saveJson: boolean = false,
    showTimestamps: boolean = false,
  ) {
    this.showTimestamps = showTimestamps;
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
      else baseFunc(msg);
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
   * Gets the current task ID from the async context
   */
  private getCurrentTaskId(): string | undefined {
    const threadId = Logger.asyncLocalStorage.get(
      // Use a simple approximation of thread ID in single-threaded JS
      Math.floor(Date.now() / 1000) % 1000000,
    );
    return threadId;
  }

  /**
   * Creates a new execution context and returns a function to run code within it.
   * @param contextName The name of the context to use in logs
   * @returns A function that executes the provided callback in the context
   */
  public withContext<T>(
    contextName: string,
  ): (fn: () => Promise<T>) => Promise<T> {
    return async (fn: () => Promise<T>): Promise<T> => {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const threadId = Math.floor(Date.now() / 1000) % 1000000;
      // Set context and task ID
      this.setContext(taskId, contextName);
      Logger.asyncLocalStorage.set(threadId, taskId);
      try {
        return await fn();
      } finally {
        this.clearContext(taskId);
        Logger.asyncLocalStorage.delete(threadId);
      }
    };
  }

  /**
   * Sets the context for a specific task ID.
   * @param taskId Unique identifier for the current task/thread
   * @param context The context string to prepend to log messages.
   */
  public setContext(taskId: string, context: string): void {
    this.contextMap.set(taskId, context);
  }

  /**
   * Clears the context for a specific task ID.
   * @param taskId Unique identifier for the current task/thread
   */
  public clearContext(taskId: string): void {
    this.contextMap.delete(taskId);
  }

  /**
   * Formats the current time as [HH:MM:SS.ms]
   * @returns Formatted timestamp string
   */
  private getTimestamp(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");
    const milliseconds = now.getMilliseconds().toString().padStart(3, "0");
    return `[${hours}:${minutes}:${seconds}.${milliseconds}]`;
  }

  /**
   * Logs a message at the specified log level if a corresponding log function is defined.
   * @param level The severity level of the log entry.
   * @param msg The content of the log message.
   * @param taskId Optional task identifier to retrieve the correct context
   */
  protected log(level: LogLevel, msg: MessageType, taskId?: string): void {
    const logFunction = this.logFunctions.get(level);
    if (logFunction) {
      // Try to get task ID from parameter or current context
      const effectiveTaskId = taskId || this.getCurrentTaskId();
      let contextPrefix = "";
      if (effectiveTaskId && this.contextMap.has(effectiveTaskId)) {
        contextPrefix = `[${this.contextMap.get(effectiveTaskId)}] `;
      }
      const timestampPrefix = this.showTimestamps
        ? `${this.getTimestamp()} `
        : "";
      logFunction(`${timestampPrefix}${contextPrefix}${msg}`);
    }
  }

  /**
   * Logs a debug message.
   * @param msg The debug message to log.
   * @param taskId Optional task identifier to retrieve the correct context
   */
  public debug(msg: MessageType, taskId?: string): void {
    this.log(LogLevel.DEBUG, msg, taskId);
    if (this.saveJson) {
      this.jsonLogs.get(LogLevel.DEBUG)!.push(msg.toString());
    }
  }

  /**
   * Logs an info message.
   * @param msg The info message to log.
   * @param taskId Optional task identifier to retrieve the correct context
   */
  public info(msg: MessageType, taskId?: string): void {
    this.log(LogLevel.INFO, msg, taskId);
    if (this.saveJson) {
      this.jsonLogs.get(LogLevel.INFO)!.push(msg.toString());
    }
  }

  /**
   * Logs a warning message.
   * @param msg The warning message to log.
   * @param taskId Optional task identifier to retrieve the correct context
   */
  public warn(msg: MessageType, taskId?: string): void {
    this.log(LogLevel.WARN, msg, taskId);
    if (this.saveJson) {
      this.jsonLogs.get(LogLevel.WARN)!.push(msg.toString());
    }
  }

  /**
   * Logs an error message.
   * @param msg The error message to log.
   * @param taskId Optional task identifier to retrieve the correct context
   */
  public error(msg: MessageType, taskId?: string): void {
    this.log(LogLevel.ERROR, msg, taskId);
    if (this.saveJson) {
      this.jsonLogs.get(LogLevel.ERROR)!.push(msg.toString());
    }
  }
}

/**
 * Logger that silences all logs.
 */
export class QuietLogger extends Logger {
  constructor(saveJson: boolean = false, showTimestamps: boolean = false) {
    super(
      {
        [LogLevel.INFO]: undefined,
        [LogLevel.WARN]: undefined,
        [LogLevel.ERROR]: undefined,
      },
      saveJson,
      showTimestamps,
    );
  }
}

/**
 * Logger that enables debug level logging to stdin.
 */
export class DebugLogger extends Logger {
  constructor(saveJson: boolean = false, showTimestamps: boolean = false) {
    super(
      {
        [LogLevel.DEBUG]: console.log,
      },
      saveJson,
      showTimestamps,
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
  constructor(saveJson: boolean = false, showTimestamps: boolean = false) {
    super(
      {
        [LogLevel.DEBUG]: trace,
        [LogLevel.INFO]: trace,
        [LogLevel.WARN]: trace,
        [LogLevel.ERROR]: trace,
      },
      saveJson,
      showTimestamps,
    );
  }
}
