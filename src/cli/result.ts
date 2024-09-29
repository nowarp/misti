import { unreachable } from "../internals/util";

/**
 * MistiResultOK represents the result of a Misti operation that did not find any warnings.
 */
export type MistiResultOK = {
  kind: "ok";
};

/**
 * MistiResultWarnings represents the result of a Misti operation that found warnings.
 */
export type MistiResultWarnings = {
  kind: "warnings";
  /**
   * Warnings found by Misti.
   */
  warnings: string[];
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
  name: string;
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
export function resultToString(result: MistiResult): string {
  switch (result.kind) {
    case "ok":
      return "No errors found";
    case "error":
      return `Misti execution failed:\n${result.error}`;
    case "warnings":
      return result.warnings
        .map(
          (warning, index) =>
            warning + (index < result.warnings.length - 1 ? "\n" : ""),
        )
        .join("")
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
