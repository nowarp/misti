/**
 * Configuration for a tool.
 */
export interface ToolConfig {
  /**
   * Path to the module containing the tool.
   * Used only for custom out-of-tree tools.
   */
  modulePath?: string;
  /**
   * Name of the class that implements the tool.
   */
  className: string;
  /**
   * Generic set of options for tools
   */
  options?: Record<string, unknown>;
}

/**
 * Configuration for a detector.
 */
export interface DetectorConfig {
  /**
   * Path to the module containing the detector.
   * Used only for custom out-of-tree detectors.
   */
  modulePath?: string;
  /**
   * Name of the class that implements the detector.
   */
  className: string;
}

export type OutputFormat = "json" | "plain";

/**
 * Exit codes after executing Misti.
 */
export enum ExitCode {
  /**
   * Successful execution. No warnings or errors reported.
   */
  SUCCESS = 0,
  /**
   * Warnings were reported.
   */
  WARNINGS = 1,
  /**
   * Execution failed because of an error.
   */
  EXECUTION_FAILURE = 2,
}
