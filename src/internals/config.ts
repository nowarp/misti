import { z } from "zod";
import * as fs from "fs";

interface DetectorConfig {
  modulePath?: string; // Optional for built-in detectors
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
  verbosity: VerbositySchema.optional().default("default"),
});

/**
 * Built-in detectors enabled by default, if no user configuration is provided.
 */
export const BUILTIN_DETECTORS: DetectorConfig[] = [
  { className: "DivideBeforeMultiply" },
  { className: "ReadOnlyVariables" },
  { className: "NeverAccessedVariables" },
  { className: "UnboundLoops" },
  { className: "ZeroAddress" },
];

/**
 * Represents content of the Misti configuration file (misti.config.json).
 */
export class MistiConfig {
  public detectorsEnabled: DetectorConfig[];
  public ignoredProjects: string[];
  public soufflePath?: string;
  public tactStdlibPath?: string;
  public verbosity: "quiet" | "debug" | "default";

  constructor(configPath?: string) {
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
        detectors: BUILTIN_DETECTORS,
        ignored_projects: [],
        soufflePath: undefined,
        tactStdlibPath: undefined,
        verbosity: "default",
      };
    }

    try {
      const parsedConfig = ConfigSchema.parse(configData);
      this.detectorsEnabled = parsedConfig.detectors;
      this.ignoredProjects = parsedConfig.ignored_projects || [];
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
}
