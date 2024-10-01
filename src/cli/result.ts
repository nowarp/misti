import { DUMP_STDOUT_PATH } from "./driver";
import { OutputFormat } from "../cli/types";
import { InternalException } from "../internals/exceptions";
import { unreachable } from "../internals/util";
import fs from "fs";
import JSONbig from "json-bigint";
import path from "path";

/**
 * MistiResultOK represents the result of a Misti operation that did not find any warnings.
 */
export type MistiResultOK = {
  kind: "ok";
};

export type WarningOutput = {
  /**
   * Project that has been checked.
   */
  projectName: string;
  /**
   * Warnings found by Misti.
   */
  warnings: string[];
};

/**
 * MistiResultWarnings represents the result of a Misti operation that found warnings.
 */
export type MistiResultWarnings = {
  kind: "warnings";
  warnings: WarningOutput[];
};

/**
 * MistiResultError represents the result of a Misti operation that encountered an error.
 */
export type MistiResultError = {
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
   */
  projectName: string;
  output: string;
};

/**
 * MistiResultTool represents the result of a Misti operation that executed an internal tool.
 */
export type MistiResultTool = {
  kind: "tool";
  output: ToolOutput[];
};

export type MistiResult =
  | MistiResultOK
  | MistiResultWarnings
  | MistiResultTool
  | MistiResultError;

/**
 * Converts a MistiResult object to a readable string based on its kind.
 */
export function resultToString(
  result: MistiResult,
  outputFormat: OutputFormat,
): string {
  if (outputFormat === "json") {
    return JSONbig.stringify(result, null, 2);
  }
  switch (result.kind) {
    case "ok":
      return "No errors found";
    case "error":
      return `Misti execution failed:\n${result.error}`;
    case "warnings":
      return result.warnings
        .flatMap((warningOutput) => warningOutput.warnings)
        .join("\n")
        .trim();
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
 * @returns The report of the result.
 */
export function saveResultToFiles(
  result: MistiResult,
  outputPath: string,
): ResultReport {
  if (outputPath === DUMP_STDOUT_PATH) {
    throw InternalException.make(`Incorrect output path: ${outputPath}`);
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
      result.warnings.forEach((warn) => {
        fs.writeFileSync(
          path.join(outputPath, `${warn.projectName}.warnings.out`),
          warn.warnings.join("\n"),
        );
      });
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
