import { ExecutionException } from "./exceptions";
import { ToolConfig, DetectorConfig } from "../cli";
import { getAllDetectors, getEnabledDetectors } from "../detectors/detector";
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

const VerbositySchema = z.enum(["quiet", "debug", "default"]);

const ConfigSchema = z.object({
  detectors: z.array(DetectorConfigSchema).optional(),
  tools: z.array(ToolConfigSchema).optional(),
  ignoredProjects: z.array(z.string()).optional(),
  soufflePath: z.string().optional(),
  souffleVerbose: z.boolean().optional(),
  tactStdlibPath: z.string().optional(),
  unusedPrefix: z.string().default("_"),
  verbosity: VerbositySchema.optional().default("default"),
});

/**
 * Represents content of the Misti configuration file (misti.config.json).
 */
export class MistiConfig {
  public detectors: DetectorConfig[];
  public tools: ToolConfig[];
  public ignoredProjects: string[];
  public soufflePath: string = "/tmp/misti/souffle";
  public souffleVerbose?: boolean;
  public tactStdlibPath?: string;
  public unusedPrefix: string;
  public verbosity: "quiet" | "debug" | "default";

  constructor(
    params: Partial<{
      configPath?: string;
      detectors?: string[];
      tools?: ToolConfig[];
      allDetectors: boolean;
    }> = {},
  ) {
    const {
      configPath = undefined,
      detectors = undefined,
      tools = undefined,
      allDetectors = false,
    } = params;
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
      // Override detectors if `--detectors` is set
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
}
