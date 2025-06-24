import { STDOUT_PATH } from "./options";
import { OutputFormat, ExitCode } from "../cli/types";
import { InternalException } from "../internals/exceptions";
import { unreachable } from "../internals/util";
import {
  formatWarning,
  Warning,
  warningsToSarifReport,
} from "../internals/warnings";
import fs from "fs";
import JSONbig from "json-bigint";
import path from "path";

type LogMap = {
  logs?: Record<string, string[]>;
};

/**
 * Result of a Misti operation that did not find any warnings.
 */
export type ResultOK = LogMap & {
  kind: "ok";
};

/**
 * Result of a Misti operation that found warnings.
 */
export type ResultWarnings = LogMap & {
  kind: "warnings";
  warnings: Warning[];
};

/**
 * Result of a Misti operation that encountered an error.
 */
export type ResultError = LogMap & {
  kind: "error";
  /**
   * Error output when Misti cannot complete the requested operation.
   */
  error: string;
};

export type ToolOutput = {
  /**
   * Name of the tool.
   */
  name: string;
  /**
   * Project this tool was executed for.
   * `undefined` if the tool doesn't require source code.
   */
  projectName: string | undefined;
  output: string;
};

/**
 * Result of a Misti operation that executed an internal tool.
 */
export type ResultTool = LogMap & {
  kind: "tool";
  output: ToolOutput[];
};

export type Result = ResultOK | ResultWarnings | ResultTool | ResultError;

/**
 * Converts a MistiResult object to a readable string based on its kind.
 */
export function resultToString(
  result: Result,
  outputFormat: OutputFormat,
  colorizeOutput: boolean,
  projectInfo?: Map<string, { projectRoot: string }>,
): string {
  if (outputFormat === "json") {
    return JSONbig.stringify(result, null, 2);
  }
  if (outputFormat === "sarif") {
    switch (result.kind) {
      case "warnings":
        const exitCode = ExitCode.WARNINGS;
        const executionSuccessful = true; // Tool ran successfully, but found warnings
        const repositoryRoot = projectInfo
          ? Array.from(projectInfo.values())[0]?.projectRoot
          : undefined;
        const sarifReport = warningsToSarifReport(
          result.warnings,
          executionSuccessful,
          exitCode,
          repositoryRoot,
        );
        return JSONbig.stringify(sarifReport, null, 2);
      case "ok":
        // Empty SARIF report for no warnings
        const emptyRepositoryRoot = projectInfo
          ? Array.from(projectInfo.values())[0]?.projectRoot
          : undefined;
        const emptySarifReport = warningsToSarifReport(
          [],
          true,
          ExitCode.SUCCESS,
          emptyRepositoryRoot,
        );
        return JSONbig.stringify(emptySarifReport, null, 2);
      case "error":
        throw new Error(
          `SARIF format is not supported for error results: ${result.error}`,
        );
      case "tool":
        throw new Error("SARIF format is not supported for tool results");
      default:
        unreachable(result);
    }
  }
  switch (result.kind) {
    case "ok":
      return "No errors found";
    case "error":
      return `Misti execution failed:\n${result.error}`;
    case "warnings":
      const formattedWarnings: string[] = [];
      result.warnings.forEach((warn, index) => {
        const isLastWarning = index === result.warnings.length - 1;
        formattedWarnings.push(
          formatWarning(warn, colorizeOutput, !isLastWarning),
        );
      });
      return formattedWarnings.join("\n").trim();
    case "tool":
      return result.output.length === 1
        ? result.output[0].output.trim()
        : result.output
            .map((tool) => `${tool.name}:\n${tool.output}`)
            .join("\n\n")
            .trim();
    default:
      unreachable(result);
  }
}

export function resultToExitCode(result: Result): ExitCode {
  switch (result.kind) {
    case "ok":
    case "tool":
      return ExitCode.SUCCESS;
    case "warnings":
      return ExitCode.WARNINGS;
    case "error":
      return ExitCode.EXECUTION_FAILURE;
    default:
      unreachable(result);
  }
}

export type ResultReport =
  | { kind: "ok" }
  | { kind: "error"; message: string }
  | null;

/**
 * Saves the result of a Misti operation to files.
 *
 * The names of the files follow the following format:
 * - <project-name>.warnings.out
 * - <project-name>.<tool-name>.out
 *
 * @param result The result of a Misti operation.
 * @param outputPath The path to save the result to.
 * @param outputFormat The output format (json, plain, or sarif).
 * @param colorizeOutput Whether to colorize the output.
 * @returns The report of the result.
 */
export function saveResultToFiles(
  result: Result,
  outputPath: string,
  outputFormat: OutputFormat,
  colorizeOutput: boolean,
  projectInfo?: Map<string, { projectRoot: string }>,
): ResultReport {
  if (outputPath === STDOUT_PATH) {
    throw InternalException.make(`Incorrect output path: ${outputPath}`);
  }
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }
  switch (result.kind) {
    case "ok":
      return { kind: "ok" };
    case "error":
      return {
        kind: "error",
        message: result.error,
      };
    case "warnings":
      let content: string;
      let extension: string;
      if (outputFormat === "json") {
        content = JSONbig.stringify(result, null, 2);
        extension = "json";
      } else if (outputFormat === "sarif") {
        const exitCode = ExitCode.WARNINGS;
        const executionSuccessful = true; // Tool ran successfully, but found warnings
        const repositoryRoot = projectInfo
          ? Array.from(projectInfo.values())[0]?.projectRoot
          : undefined;
        const sarifReport = warningsToSarifReport(
          result.warnings,
          executionSuccessful,
          exitCode,
          repositoryRoot,
        );
        content = JSONbig.stringify(sarifReport, null, 2);
        extension = "sarif";
      } else {
        content = result.warnings
          .map((warning) => formatWarning(warning, colorizeOutput, false))
          .join("\n");
        extension = "out";
      }
      fs.writeFileSync(path.join(outputPath, `warnings.${extension}`), content);
      return null;
    case "tool":
      result.output.forEach((tool) => {
        fs.writeFileSync(
          path.join(outputPath, `${tool.projectName}.${tool.name}.out`),
          tool.output,
        );
      });
      return null;
    default:
      unreachable(result);
  }
}
