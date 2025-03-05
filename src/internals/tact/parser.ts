import { getParser, stdLibFiles } from "../../internals/tact/imports";
import {
  enableFeatures,
  AstStore,
  getRawAST,
  CompilerContext,
  Project,
  getAstFactory,
  precompile,
} from "../../internals/tact/imports";
import { VirtualFileSystem } from "../../vfs/virtualFileSystem";
import { MistiContext } from "../context";
import { TactException } from "../exceptions";
import { getStdlibPath } from "./stdlib";
import { createNodeFileSystem } from "../../vfs/createNodeFileSystem";
import {
  createVirtualFileSystem,
  VirtualFileSystem as TactVirtualFileSystem,
} from "@tact-lang/compiler";

/**
 * Parses the project defined in the Tact configuration file, generating its AST.
 *
 * @param mistiCtx Misti context
 * @param projectRoot Absolute path to the root the project
 * @param config The Tact configuration object: contents of the existing file or a generated object
 * @param projectVfs Virtual file system to manage file interactions during parsing
 * @returns A mapping of project names to their corresponding ASTs.
 */
export function parseTactProject(
  mistiCtx: MistiContext,
  projectConfig: Project,
  projectRoot: string,
  projectVfs: VirtualFileSystem,
): AstStore | never {
  const stdlibPath = mistiCtx.config.tactStdlibPath ?? getStdlibPath();
  let stdlibVfs: VirtualFileSystem | TactVirtualFileSystem;

  if (projectVfs.type === "local") {
    stdlibVfs = createNodeFileSystem(stdlibPath);
    projectVfs = createNodeFileSystem(projectRoot);
  } else {
    stdlibVfs = createVirtualFileSystem("@stdlib", stdLibFiles);
  }

  mistiCtx.logger.debug(`Parsing project ${projectConfig.name} ...`);
  try {
    let ctx = new CompilerContext();
    ctx = enableFeatures(ctx, mistiCtx.logger, projectConfig);
    const astFactory = getAstFactory();
    ctx = precompile(
      ctx,
      projectVfs,
      stdlibVfs,
      projectConfig.path,
      getParser(astFactory, "new"),
      astFactory,
    );
    return getRawAST(ctx);
  } catch (error: unknown) {
    throw TactException.make(error);
  }
}
