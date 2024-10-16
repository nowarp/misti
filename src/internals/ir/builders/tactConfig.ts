import { ProjectName } from "..";
import { setTactStdlibPath } from "./tactStdlib";
import { MistiContext } from "../../context";
import {
  ExecutionException,
  TactException,
  throwZodError,
} from "../../exceptions";
import {
  ConfigProject,
  Config as TactConfig,
  parseConfig,
} from "@tact-lang/compiler/dist/config/parseConfig";
import { CompilerContext } from "@tact-lang/compiler/dist/context";
import { getRawAST } from "@tact-lang/compiler/dist/grammar/store";
import { AstStore } from "@tact-lang/compiler/dist/grammar/store";
import { enableFeatures } from "@tact-lang/compiler/dist/pipeline/build";
import { precompile } from "@tact-lang/compiler/dist/pipeline/precompile";
import { createNodeFileSystem } from "@tact-lang/compiler/dist/vfs/createNodeFileSystem";
import fs from "fs";
import path from "path";

export class TactConfigManager {
  private config: TactConfig;

  constructor(
    private ctx: MistiContext,
    private tactConfigPath: string,
  ) {
    this.config = this.readTactConfig();
  }

  /**
   * Reads the Tact configuration file from the specified path, parses it, and returns
   * the TactConfig object.
   * @throws {Error} If the config file does not exist or cannot be parsed.
   * @returns The parsed TactConfig object.
   */
  private readTactConfig(): TactConfig {
    const resolvedPath = path.resolve(this.tactConfigPath);
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
   * Parses the projects defined in the Tact configuration file, generating an AST for each.
   * @param config The Tact configuration object.
   * @returns A mapping of project names to their corresponding ASTs.
   */
  public parseTactProjects(): Map<ProjectName, AstStore> {
    const project = createNodeFileSystem(
      path.dirname(this.tactConfigPath),
      false,
    );
    const stdlibPath = this.ctx.config.tactStdlibPath ?? setTactStdlibPath();
    const stdlib = createNodeFileSystem(stdlibPath, false);
    return this.config.projects.reduce(
      (acc: Map<ProjectName, AstStore>, projectConfig: ConfigProject) => {
        this.ctx.logger.debug(`Parsing project ${projectConfig.name} ...`);
        try {
          let ctx = new CompilerContext();
          ctx = enableFeatures(ctx, this.ctx.logger, projectConfig);
          ctx = precompile(ctx, project, stdlib, projectConfig.path);
          acc.set(projectConfig.name, getRawAST(ctx));
          return acc;
        } catch (error: unknown) {
          throw TactException.make(error);
        }
      },
      new Map<ProjectName, AstStore>(),
    );
  }
}
