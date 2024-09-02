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
      allDetectors: boolean;
    }> = {},
  ) {
    const {
      configPath = undefined,
      detectors = undefined,
      allDetectors = false,
    } = params;
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
      // Override detectors if `--detectors` is set
      if (detectors !== undefined) {
        configData = {
          ...configData,
          detectors: this.createDetectorConfigs(detectors, allDetectors),
        };
      }
    } else {
      // Use default detectors if no config file is provided
      configData = {
        detectors: this.createDetectorConfigs(detectors, allDetectors),
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
      this.detectors = parsedConfig.detectors;
      this.ignoredProjects = parsedConfig.ignoredProjects || [];
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

  private createDetectorConfigs(
    detectors: string[] | undefined,
    allDetectors: boolean,
  ): DetectorConfig[] {
    if (detectors !== undefined) {
      const builtinDetectors = new Set(getAllDetectors());
      return detectors.reduce<DetectorConfig[]>((acc, detector) => {
        if (builtinDetectors.has(detector)) {
          acc.push({ className: detector });
        } else {
          const parts = detector.split(":");
          if (parts.length !== 2) {
            throw new Error(
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
