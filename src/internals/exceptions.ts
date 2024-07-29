import { AstNode, SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";
import JSONbig from "json-bigint";
import * as fs from "fs";
import * as path from "path";

const REPORTS_DIR = "/tmp/misti/reports";
const SEPARATOR =
  "============================================================";

function generateReportText(reportFilePath: string): string {
  return `The error report was saved to the file: ${reportFilePath}. Please help us publishing it and the input sources at: https://github.com/nowarp/misti/issues/new.`;
}

export class TactException {
  private constructor() {}
  static make(error: unknown): Error {
    if (!(error instanceof Error)) {
      throw error;
    }
    const errorKind = "Internal Tact Compiler Error:";
    const fullMsg = [
      errorKind,
      SEPARATOR,
      error.message,
      error.stack,
      SEPARATOR,
      getCmd(),
      getCurrentStackTrace(),
    ].join("\n");
    const shortMsg = [errorKind, error.message].join("\n");
    // Dump full message to the file.
    const reportFilePath = dumpReportFile(fullMsg, shortMsg);
    const reportText = generateReportText(reportFilePath);
    // Display short message to the user.
    return new Error([shortMsg, reportText].join("\n"));
  }
}

export class InternalException {
  private constructor() {}
  static make(
    msg: string,
    params: Partial<{ loc?: SrcInfo; node?: AstNode }> = {},
  ): Error {
    const { loc = undefined, node = undefined } = params;
    const locStr = this.makeLocationString(loc);
    const errorKind = `Internal Misti Error${locStr}:`;
    const fullMsg = [
      errorKind,
      msg,
      ...(node === undefined
        ? []
        : [`${SEPARATOR}AST node:\n${JSONbig.stringify(node, null, 2)}`]),
      SEPARATOR,
      getCmd(),
      getCurrentStackTrace(),
    ].join("\n");
    const shortMsg = [errorKind, msg].join("\n");
    const reportFilePath = dumpReportFile(fullMsg, shortMsg);
    const reportText = generateReportText(reportFilePath);
    // Display short message to the user.
    return new Error([shortMsg, reportText].join("\n"));
  }

  static makeLocationString(loc: SrcInfo | undefined): string {
    return loc
      ? (() => {
          const { lineNum, colNum } = loc.interval.getLineAndColumn();
          return lineNum !== 0 && colNum !== 0
            ? ` at ${lineNum}:${colNum}`
            : "";
        })()
      : "";
  }
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

/** Returns the command used to execute code, like: "$0 $@". */
function getCmd(): string {
  return `Command: ${process.argv.join(" ")}`;
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
