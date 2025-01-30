import { MistiContext } from "../context";
import { hasSubdirs } from "../util";
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
 * Returns an absolute path to Tact stdlib distributed within the tact compiler
 * package.
 */
export function getStdlibPath() {
  return path.join(
    path.dirname(require.resolve("@tact-lang/compiler/package.json")),
    "stdlib",
  );
}

/**
 * Checks if a given location or file path is defined in the Tact stdlib.
 * @param ctx MistiContext object
 * @param locOrPath SrcInfo object or string file path
 * @returns boolean indicating if the location is in the stdlib
 */
export function definedInStdlib(
  ctx: MistiContext,
  locOrPath: SrcInfo | string,
): boolean {
  const stdlibPath = ctx.config.tactStdlibPath;
  const pathElements =
    stdlibPath === undefined
      ? DEFAULT_STDLIB_PATH_ELEMENTS
      : stdlibPath.split("/").filter((part) => part !== "");
  const filePath = typeof locOrPath === "string" ? locOrPath : locOrPath.file;

  return (
    filePath !== null &&
    (filePath.startsWith("@stdlib") || hasSubdirs(filePath, pathElements))
  );
}
