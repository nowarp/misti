/**
 * This module contains definitions from the Tact stdlib  and logic for
 * accessing the stdlib in Misti.
 *
 * It should be reviewed before each Tact update to determine if updates are needed.
 *
 * @packageDocumentation
 */

import { SrcInfo } from "../../internals/tact/imports";
import { MistiContext } from "../context";
import { hasSubdirs, isBrowser } from "../util";
import path from "path";

/**
 * Stdlib functions that access datetime functions.
 */
export const DATETIME_FUNCTIONS = new Set(["now", "timestamp"]);

/**
 * Stdlib functions that initialize PRG seed.
 */
export const PRG_INIT_FUNCTIONS = new Set([
  "nativePrepareRandom",
  "nativeRandomize",
  "nativeRandomizeLt",
]);

/**
 * Native stdlib functions that use PRG.
 */
export const PRG_NATIVE_USE_FUNCTIONS = new Set([
  "nativeRandom",
  "nativeRandomInterval",
]);

/**
 * Safe Tact wrapper functions that use PRG.
 */
export const PRG_SAFE_USE_FUNCTIONS = new Set(["random", "randomInt"]);

/**
 * Map methods that mutate state.
 * See: https://docs.tact-lang.org/book/maps/
 */
export const MAP_MUTATING_METHODS = new Set<string>([
  "set",
  "del",
  "replace",
  "replaceGet",
]);

/**
 * Builder methods mutating state.
 * https://github.com/tact-lang/tact/blob/08133e8418f3c6dcb49229b45cfeb7dd261bbe1f/stdlib/std/cells.tact#L75
 */
export const BUILDER_MUTATING_METHODS = new Set<string>([
  "storeRef",
  "storeBits",
  "storeInt",
  "storeUint",
  "storeBool",
  "storeBit",
  "storeCoins",
  "storeAddress",
  "skipBits",
]);

/**
 * String mutating methods.
 * https://github.com/tact-lang/tact/blob/08133e8418f3c6dcb49229b45cfeb7dd261bbe1f/stdlib/std/text.tact#L18
 */
export const STRING_MUTATING_METHODS = new Set<string>(["append"]);

/**
 * Path separator used in paths in the browser environment.
 */
export const BROWSER_PATH_SEP = "/";

/**
 * Path to browser starting from the VFS root: `/`.
 */
export const BROWSER_STDLIB_PATH_ELEMENTS = [
  BROWSER_PATH_SEP,
  "node_modules",
  "@tact-lang",
  "compiler",
  "stdlib",
  "stdlib",
];

/**
 * @returns A mandatory part of the file path to stdlib if using the default path.
 */
export function getDefaultStdlibPathElements(): string[] {
  return isBrowser()
    ? BROWSER_STDLIB_PATH_ELEMENTS
    : [
        ...path
          .dirname(require.resolve("@tact-lang/compiler/package.json"))
          .split(path.sep)
          .filter(Boolean)
          .slice(-2),
        "dist",
        "stdlib",
        "stdlib",
      ];
}

/**
 * Returns an absolute path to Tact stdlib distributed within the tact compiler
 * package.
 */
export function getStdlibPath() {
  return isBrowser()
    ? BROWSER_STDLIB_PATH_ELEMENTS.join(BROWSER_PATH_SEP)
    : path.join(
        path.dirname(require.resolve("@tact-lang/compiler/package.json")),
        "dist",
        "stdlib",
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
      ? getDefaultStdlibPathElements()
      : stdlibPath.split(path.sep).filter((part) => part !== "");
  const filePath = typeof locOrPath === "string" ? locOrPath : locOrPath.file;
  return (
    filePath !== null &&
    (filePath.startsWith("@stdlib") || hasSubdirs(filePath, pathElements))
  );
}
