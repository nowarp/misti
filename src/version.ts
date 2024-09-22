import * as packageJson from "../package.json";

export const MISTI_VERSION = packageJson.version;

const normalizeVersion = (version: string): string =>
  version[0] === "^" || version[0] === "~" ? version.slice(1) : version;

/** The supported version of the Tact compiler. */
export const TACT_VERSION = normalizeVersion(
  packageJson.dependencies["@tact-lang/compiler"],
);
