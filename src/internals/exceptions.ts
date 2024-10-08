import { TACT_VERSION, MISTI_VERSION } from "../version";
import { AstNode, SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";
import * as fs from "fs";
import JSONbig from "json-bigint";
import * as path from "path";
import { ZodError } from "zod";

const REPORTS_DIR = "/tmp/misti/reports";
const SEPARATOR =
  "============================================================";

function generateReportText(reportFilePath: string): string {
  return `The error report was saved to the file: ${reportFilePath}. Please help us publishing it and the input sources at: https://github.com/nowarp/misti/issues/new.`;
}

/**
 * Represents all the errors coming from the Tact compiler API.
 */
export class TactException {
  private constructor() {}
  static make(error: unknown): Error {
    if (!(error instanceof Error)) {
      throw error;
    }
    const tactStack = error.stack;
    // Display errors that should not be reported as issues.
    if (this.isParserError(tactStack)) {
      return new Error(`Syntax error: ${error.message}`);
    }
    if (this.isCompilationError(tactStack)) {
      return new Error(`Compilation error: ${error.message}`);
    }

    // Display an error that should be reported to issues.
    const errorKind = "Internal Tact Compiler Error:";
    const fullMsg = [
      errorKind,
      SEPARATOR,
      error.message,
      tactStack,
      SEPARATOR,
      getCmd(),
      getVersions(),
    ].join("\n");
    const shortMsg = [errorKind, error.message].join("\n");
    // Dump full message to the file.
    const reportFilePath = dumpReportFile(fullMsg, shortMsg);
    const reportText = generateReportText(reportFilePath);
    // Display short message to the user.
    return new Error([shortMsg, reportText].join("\n"));
  }

  /**
   * Returns true if `stack` represents a syntax error.
   */
  static isParserError(stack: string | undefined): boolean {
    return stack !== undefined && stack.includes("at throwParseError");
  }

  /**
   * Returns true if `stack` represents a compilation error.
   */
  static isCompilationError(stack: string | undefined): boolean {
    return stack !== undefined && stack.includes("at throwCompilationError");
  }
}

/**
 * Attempts to pretty-print the input, falling back to JSON stringification if it fails.
 * @param input The object to pretty-print or stringify.
 * @returns A string representation of the input.
 */
function prettyPrintOrStringify(input: unknown): string {
  try {
    return `AST:\n${prettyPrint(input as AstNode)}`;
  } catch (error) {
    try {
      return JSONbig.stringify(input, null, 2);
    } catch (jsonError) {
      return `[Unable to stringify object: ${jsonError}]`;
    }
  }
}

/**
 * Internal error, typically caused by a bug in Misti or incorrect API usage.
 */
export class InternalException {
  private constructor() {}
  static make(
    msg: string,
    {
      loc = undefined,
      node = undefined,
      generateReport = true,
    }: Partial<{
      loc: SrcInfo;
      node: unknown;
      generateReport: boolean;
    }> = {},
  ): Error {
    const locStr = makeLocationString(loc);
    const errorKind = `Internal Misti Error${locStr}:`;
    const fullMsg = [
      errorKind,
      msg,
      ...(node === undefined
        ? []
        : [`${SEPARATOR}${prettyPrintOrStringify(node)}`]),
      SEPARATOR,
      getCurrentStackTrace(),
      SEPARATOR,
      getCmd(),
      getVersions(),
    ].join("\n");
    const shortMsg = [errorKind, msg, getVersions()].join("\n");
    if (!generateReport) {
      return new Error(shortMsg);
    }
    const reportFilePath = dumpReportFile(fullMsg, shortMsg);
    const reportText = generateReportText(reportFilePath);
    // Display short message to the user.
    return new Error([shortMsg, reportText].join("\n"));
  }
}

/**
 * An error caused by incorrect actions of the user, such as wrong configuration,
 * problems in the environment, wrong CLI options.
 */
export class ExecutionException {
  private constructor() {}
  static make(
    msg: string,
    {
      loc = undefined,
    }: Partial<{
      loc: SrcInfo;
      node: AstNode;
    }> = {},
  ): Error {
    const locStr = makeLocationString(loc);
    const errorKind = `Execution Error${locStr}:`;
    const shortMsg = [errorKind, msg].join("\n");
    return new Error(shortMsg);
  }
}

function makeLocationString(loc: SrcInfo | undefined): string {
  return loc
    ? (() => {
        const { lineNum, colNum } = loc.interval.getLineAndColumn();
        return lineNum !== 0 && colNum !== 0 ? ` at ${lineNum}:${colNum}` : "";
      })()
    : "";
}

/**
 * Returns backtrace of the JS script upon execution.
 */
function getCurrentStackTrace(): string {
  try {
    throw new Error();
  } catch (error) {
    if (error instanceof Error) {
      return `Misti Backtrace: ${error.stack}` || "No stack trace available";
    } else {
      return "Unable to get stack trace";
    }
  }
}

/**
 * @returns Command used to execute code, like: "$0 $@".
 */
function getCmd(): string {
  return `Command: ${process.argv.join(" ")}`;
}

/**
 * @returns Tact and Misti versions string.
 */
function getVersions(): string {
  return `Using Tact ${TACT_VERSION}; Misti ${MISTI_VERSION}`;
}

/**
 * Saves the comprehensive information on this error to the text file that is supposed to be published in the issue.
 * @param fullMsg A error message to save to file.
 * @param shortMsg A error message to display to the user if it is not possible to create a file.
 * @returns Path to the created file.
 */
function dumpReportFile(
  fullMsg: string,
  shortMsg: string,
  reportsDir: string = REPORTS_DIR,
): string {
  try {
    fs.mkdirSync(reportsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportFile = path.join(reportsDir, `${timestamp}.txt`);
    fs.writeFileSync(reportFile, fullMsg);
    return reportFile;
  } catch (error) {
    throw new Error(shortMsg);
  }
}

/**
 * Wraps the `try` clause adding an extra context to the exception text.
 */
export function tryMsg(callback: () => void, message: string) {
  try {
    callback();
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err;
    }
    throw new Error(`${message}: ${err.message}`);
  }
}

/**
 * Throws an ExecutionException with a human-readable ZodError message.
 * @param err The ZodError to throw.
 */
export function throwZodError(
  err: unknown,
  {
    msg = undefined,
    help = undefined,
  }: Partial<{ msg: string; help: string }> = {},
): never {
  if (err instanceof ZodError) {
    const formattedErrors = err.errors
      .map((e) => {
        const path = e.path.length ? e.path.join(" > ") : "root";
        return `- ${e.message} at ${path}`;
      })
      .join("\n");
    throw ExecutionException.make(
      `${msg ? msg + "\n" : ""}${formattedErrors}${help ? "\n\n" + help : ""}`,
    );
  } else {
    throw err;
  }
}
