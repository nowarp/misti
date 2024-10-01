/**
 * Configuration for a tool.
 */
export interface ToolConfig {
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
