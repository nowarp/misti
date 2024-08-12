import { z } from "zod";
import * as fs from "fs";
import { getEnabledDetectors, getAllDetectors } from "../detectors/detector";

interface DetectorConfig {
  modulePath?: string; // Used only for custom out-of-tree detectors
  className: string;
}

const DetectorConfigSchema = z.object({
  modulePath: z.string().optional(),
  className: z.string(),
});

const VerbositySchema = z.enum(["quiet", "debug", "default"]);

const ConfigSchema = z.object({
  detectors: z.array(DetectorConfigSchema),
  ignored_projects: z.array(z.string()).optional(),
  soufflePath: z.string().optional(),
  tactStdlibPath: z.string().optional(),
  unusedPrefix: z.string().default("_"),
  verbosity: VerbositySchema.optional().default("default"),
});

/**
 * Represents content of the Misti configuration file (misti.config.json).
 */
export class MistiConfig {
  public detectorsEnabled: DetectorConfig[];
  public ignoredProjects: string[];
  public soufflePath?: string;
  public tactStdlibPath?: string;
  public unusedPrefix: string;
  public verbosity: "quiet" | "debug" | "default";

  constructor(
    params: Partial<{ configPath?: string; allDetectors: boolean }> = {},
  ) {
    const { configPath = undefined, allDetectors = false } = params;
    let configData;
    if (configPath) {
      try {
        const configFileContents = fs.readFileSync(configPath, "utf8");
        configData = JSON.parse(configFileContents);
      } catch (err) {
        if (err instanceof Error) {
          throw new Error(
            `Could not load or parse config file (${configPath}): ${err.message}`,
          );
        } else {
          throw err;
        }
      }
    } else {
      // Use default detectors if no config file is provided
      configData = {
        detectors: this.createDetectorsConfig(allDetectors),
        ignored_projects: [],
        soufflePath: undefined,
        tactStdlibPath: undefined,
        unusedPrefix: "_",
        verbosity: "default",
      };
    }

    try {
      const parsedConfig = ConfigSchema.parse(configData);
      this.detectorsEnabled = parsedConfig.detectors;
      this.ignoredProjects = parsedConfig.ignored_projects || [];
      this.tactStdlibPath = parsedConfig.tactStdlibPath;
      this.unusedPrefix = parsedConfig.unusedPrefix;
      this.verbosity = parsedConfig.verbosity;
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new Error(
          `Failed to initialize Config with provided data: ${err.message}`,
        );
      } else {
        throw err;
      }
    }
  }

  private createDetectorsConfig(allDetectors: boolean): DetectorConfig[] {
    return (allDetectors ? getAllDetectors : getEnabledDetectors)().map(
      (name) => ({ className: name }),
    );
  }
}
