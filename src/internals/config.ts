import { ExecutionException } from "./exceptions";
import { ToolConfig, DetectorConfig } from "../cli";
import {
  getAllDetectors,
  getEnabledDetectors,
  DetectorName,
} from "../detectors/detector";
import * as fs from "fs";
import { z } from "zod";

const DetectorConfigSchema = z.object({
  modulePath: z.string().optional(),
  className: z.string(),
});

const ToolConfigSchema = z.object({
  className: z.string(),
  options: z.record(z.unknown()).optional(),
});

const WarningSuppressionSchema = z.object({
  detector: z.string(),
  position: z.string(),
});

const VerbositySchema = z.enum(["quiet", "debug", "default"]);

const ConfigSchema = z.object({
  detectors: z.array(DetectorConfigSchema).optional(),
  tools: z.array(ToolConfigSchema).optional(),
  suppressions: z.array(WarningSuppressionSchema).optional(),
  ignoredProjects: z.array(z.string()).optional(),
  soufflePath: z.string().optional(),
  souffleVerbose: z.boolean().optional(),
  tactStdlibPath: z.string().optional(),
  unusedPrefix: z.string().optional().default("_"),
  verbosity: VerbositySchema.optional().default("default"),
});

export type WarningSuppression = {
  detector: DetectorName;
  file: string;
  line: number;
  col: number;
};

/**
 * Represents content of the Misti configuration file (misti.config.json).
 */
export class MistiConfig {
  public detectors: DetectorConfig[];
  public tools: ToolConfig[];
  public suppressions: WarningSuppression[];
  public ignoredProjects: string[];
  public soufflePath: string = "/tmp/misti/souffle";
  public souffleVerbose?: boolean;
  public tactStdlibPath?: string;
  public unusedPrefix: string;
  public verbosity: "quiet" | "debug" | "default";

  constructor({
    configPath = undefined,
    detectors = undefined,
    tools = undefined,
    allDetectors = false,
  }: Partial<{
    configPath?: string;
    detectors?: string[];
    tools?: ToolConfig[];
    allDetectors: boolean;
  }> = {}) {
    let configData;
    if (configPath) {
      try {
        const configFileContents = fs.readFileSync(configPath, "utf8");
        configData = JSON.parse(configFileContents);
      } catch (err) {
        if (err instanceof Error) {
          throw ExecutionException.make(
            `Could not load or parse config file (${configPath}): ${err.message}`,
          );
        } else {
          throw err;
        }
      }
      // Override detectors if `--enabled-detectors` is set
      if (detectors !== undefined) {
        configData = {
          ...configData,
          detectors: this.createDetectorConfigs(detectors, allDetectors),
        };
      }
      // Override tools if `--tools` is set
      if (tools !== undefined) {
        configData = {
          ...configData,
          tools: tools || [],
        };
      }
    } else {
      // Use default detectors and tools if no config file is provided
      configData = {
        detectors: this.createDetectorConfigs(detectors, allDetectors),
        tools: tools || [],
        ignoredProjects: [],
        soufflePath: "/tmp/misti/souffle",
        souffleVerbose: false,
        tactStdlibPath: undefined,
        unusedPrefix: "_",
        verbosity: "default",
      };
    }

    try {
      const parsedConfig = ConfigSchema.parse(configData);
      this.detectors = parsedConfig.detectors || [];
      this.tools = parsedConfig.tools || [];
      this.suppressions = this.parseSuppressions(parsedConfig.suppressions);
      this.ignoredProjects = parsedConfig.ignoredProjects || [];
      this.tactStdlibPath = parsedConfig.tactStdlibPath;
      this.unusedPrefix = parsedConfig.unusedPrefix;
      this.verbosity = parsedConfig.verbosity;
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw ExecutionException.make(`Configuration error: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  private createDetectorConfigs(
    detectors: string[] | undefined,
    allDetectors: boolean,
  ): DetectorConfig[] {
    if (detectors !== undefined) {
      const builtinDetectors = new Set(getAllDetectors());
      return detectors.reduce<DetectorConfig[]>((acc, detector) => {
        if (detector === "") {
          // The user has specified the empty value in the config.
          return acc;
        }
        if (builtinDetectors.has(detector)) {
          acc.push({ className: detector });
        } else {
          const parts = detector.split(":");
          if (parts.length !== 2) {
            throw ExecutionException.make(
              `Cannot find built-in or custom detector: ${detector}`,
            );
          }
          const [modulePath, className] = parts;
          acc.push({ className, modulePath });
        }
        return acc;
      }, []);
    }
    return (allDetectors ? getAllDetectors : getEnabledDetectors)().map(
      (name) => ({ className: name }),
    );
  }

  /**
   * Parses the suppressions from the configuration file.
   */
  private parseSuppressions(
    suppressions: { detector: string; position: string }[] | undefined,
  ): WarningSuppression[] {
    if (!suppressions) return [];
    return suppressions.map(({ detector, position }) => {
      const parts = position.split(":");
      if (parts.length !== 3) {
        throw ExecutionException.make(
          `Invalid suppression position format: ${position}. Expected format: fileName:line:column`,
        );
      }
      const [file, lineStr, colStr] = parts;
      const line = parseInt(lineStr, 10);
      const col = parseInt(colStr, 10);
      if (isNaN(line) || isNaN(col)) {
        throw ExecutionException.make(
          `Invalid line or column number in suppression position: ${position}`,
        );
      }
      return {
        detector: detector as DetectorName,
        file,
        line,
        col,
      };
    });
  }
}

/**
 * Environment variables to configure advanced Misti options.
 */
export class MistiEnv {
  /**
   * Timeout for the detector execution in milliseconds.
   */
  public static MISTI_TIMEOUT: number = parseInt(
    process.env.MISTI_TIMEOUT || "15000",
    10,
  );

  /**
   * Whether to trace the execution.
   */
  public static MISTI_TRACE: boolean = process.env.MISTI_TRACE
    ? process.env.MISTI_TRACE === "1"
    : false;
}
