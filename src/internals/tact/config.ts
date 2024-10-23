import { ExecutionException, throwZodError } from "../exceptions";
import { ProjectName } from "../ir";
import {
  Config as TactConfig,
  ConfigProject,
  parseConfig,
} from "@tact-lang/compiler/dist/config/parseConfig";
import fs from "fs";
import path from "path";

/**
 * Manages the logic around the Tact configuration file.
 *
 * Tact config describes the structure of the project, and includes the entry
 * points to run compilation and analysis on.
 */
export class TactConfigManager {
  private constructor(
    /**
     * An absolute path to the root directory storing the configuration file.
     *
     * If the config is generated for the Tact contract, it should be a directory containing all the imported files.
     */
    private projectRoot: string,
    /** Tact config parsed with Zod. */
    private config: TactConfig,
  ) {}

  /**
   * Creates a TactConfigManager from a Tact configuration file typically specified by the user.
   *
   * @param ctx Misti context.
   * @param tactConfigPath Path to the Tact configuration file.
   */
  public static fromConfig(tactConfigPath: string): TactConfigManager {
    return new TactConfigManager(
      path.resolve(path.dirname(tactConfigPath)),
      this.readTactConfig(tactConfigPath),
    );
  }

  /**
   * Creates a TactConfigManager from a single Tact contract.
   *
   * @param ctx Misti context.
   * @param projectName Name of the project.
   * @param contractPath Path to the Tact contract.
   */
  public static fromContract(
    projectRoot: string,
    contractPath: string,
    projectName: ProjectName = path.basename(
      contractPath,
      ".tact",
    ) as ProjectName,
  ): TactConfigManager {
    const tactConfig: TactConfig = {
      projects: [
        {
          name: projectName,
          path: path.relative(projectRoot, contractPath),
          output: "/tmp/misti/output", // never used
          options: {
            debug: false,
            external: true,
          },
        },
      ],
    };
    return new TactConfigManager(projectRoot, tactConfig);
  }

  public get tactConfig(): TactConfig {
    return this.config;
  }

  /**
   * Gets projects defined within the configuration file.
   */
  public getProjects(): ConfigProject[] {
    return this.config.projects;
  }

  /**
   * Find the project config based on the provided name.
   */
  public findProjectByName(
    projectName: ProjectName,
  ): ConfigProject | undefined {
    return this.config.projects.find((project) => projectName === project.name);
  }

  /**
   * Find the project config based on the provided path.
   */
  public findProjectByPath(projectPath: string): ConfigProject | undefined {
    return this.config.projects.find(
      (project) => projectPath === this.resolveProjectPath(project.path),
    );
  }

  /**
   * Returns an absolute path or the project based on the project path.
   */
  public resolveProjectPath(projectPath: string): string {
    return path.resolve(this.projectRoot, projectPath);
  }

  /**
   * Reads the Tact configuration file from the specified path, parses it, and returns
   * the TactConfig object.
   * @throws If the config file does not exist or cannot be parsed.
   * @returns The parsed TactConfig object.
   */
  private static readTactConfig(tactConfigPath: string): TactConfig {
    const resolvedPath = path.resolve(tactConfigPath);
    if (!fs.existsSync(resolvedPath)) {
      throw ExecutionException.make(
        `Unable to find config file at ${resolvedPath}`,
      );
    }
    try {
      return parseConfig(fs.readFileSync(resolvedPath, "utf8"));
    } catch (err) {
      throwZodError(err, {
        msg: `Incorrect Tact Project file ${resolvedPath}:`,
        help: [
          `Ensure ${resolvedPath} is a Tact Project file.`,
          "See https://docs.tact-lang.org/book/config/ for additional information.",
        ].join(" "),
      });
    }
  }

  /**
   * Returns the entry points specified in the Tact configuration file (existent or not).
   */
  public getEntryPoints(): string[] {
    return this.config.projects.map((p) => p.path);
  }
}
