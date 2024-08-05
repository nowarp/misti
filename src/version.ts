import * as packageJson from "../package.json";

export const MISTI_VERSION = packageJson.version;

const removeCaret = (version: string): string =>
  version.startsWith("^") ? version.substring(1) : version;

/** The supported version of the Tact compiler. */
export const TACT_VERSION = removeCaret(
  packageJson.dependencies["@tact-lang/compiler"],
);
