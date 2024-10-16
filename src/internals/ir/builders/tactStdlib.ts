import { MistiContext } from "../../context";
import { hasSubdirs } from "../../util";
import { SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";
import path from "path";

/**
 * A mandatory part of the file path to stdlib if using the default path.
 */
export const DEFAULT_STDLIB_PATH_ELEMENTS = [
  "node_modules",
  "@tact-lang",
  "compiler",
  "stdlib",
];

/**
 * Returns path to Tact stdlib defined in the `node_modules`.
 *
 * This adjustment is needed to get an actual path to stdlib distributed within the tact package.
 */
export function setTactStdlibPath(nodeModulesPath: string = "../../../..") {
  return path.resolve(
    __dirname,
    nodeModulesPath,
    ...DEFAULT_STDLIB_PATH_ELEMENTS,
  );
}

export function definedInStdlib(ctx: MistiContext, loc: SrcInfo): boolean {
  const stdlibPath = ctx.config.tactStdlibPath;
  const pathElements =
    stdlibPath === undefined
      ? DEFAULT_STDLIB_PATH_ELEMENTS
      : stdlibPath.split("/").filter((part) => part !== "");
  return loc.file !== null && hasSubdirs(loc.file, pathElements);
}
