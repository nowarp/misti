import * as packageJson from "../package.json";

export const MISTI_VERSION = packageJson.version;

/** The supported version of Tact. */
export const TACT_VERSION = removeCaret(
  packageJson.dependencies["@tact-lang/compiler"],
);

function removeCaret(version: string): string {
  if (version.startsWith("^")) {
    return version.substring(1);
  }
  return version;
}
