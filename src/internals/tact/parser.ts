import { VirtualFileSystem } from "../../vfs/virtualFileSystem";
import { MistiContext } from "../context";
import { TactException } from "../exceptions";
import { getStdlibPath } from "./stdlib";
import { createNodeFileSystem } from "../../vfs/createNodeFileSystem";
import {
  createVirtualFileSystem,
  VirtualFileSystem as TactVirtualFileSystem,
} from "@tact-lang/compiler";
import { ConfigProject } from "@tact-lang/compiler/dist/config/parseConfig";
import { CompilerContext } from "@tact-lang/compiler/dist/context";
import { getRawAST } from "@tact-lang/compiler/dist/grammar/store";
import { AstStore } from "@tact-lang/compiler/dist/grammar/store";
import stdLibFiles from "@tact-lang/compiler/dist/imports/stdlib";
import { enableFeatures } from "@tact-lang/compiler/dist/pipeline/build";
import { precompile } from "@tact-lang/compiler/dist/pipeline/precompile";

/**
 * Parses the project defined in the Tact configuration file, generating its AST.
 *
 * @param mistiCtx Misti context
 * @param projectRoot Absolute path to the root the project
 * @param config The Tact configuration object: contents of the existing file or a generated object
 * @returns A mapping of project names to their corresponding ASTs.
 */
export function parseTactProject(
  mistiCtx: MistiContext,
  projectConfig: ConfigProject,
  projectRoot: string,
  vfs: VirtualFileSystem,
): AstStore | never {
  const stdlibPath = mistiCtx.config.tactStdlibPath ?? getStdlibPath();
  let stdlib: VirtualFileSystem | TactVirtualFileSystem;

  if (vfs.type === "node") {
    stdlib = createNodeFileSystem(stdlibPath);
    vfs = createNodeFileSystem(projectRoot);
  } else {
    stdlib = createVirtualFileSystem("@stdlib", stdLibFiles);
  }

  mistiCtx.logger.debug(`Parsing project ${projectConfig.name} ...`);
  try {
    let ctx = new CompilerContext();
    ctx = enableFeatures(ctx, mistiCtx.logger, projectConfig);
    ctx = precompile(ctx, vfs, stdlib, projectConfig.path);
    return getRawAST(ctx);
  } catch (error: unknown) {
    throw TactException.make(error);
  }
}
