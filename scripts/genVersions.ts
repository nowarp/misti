/**
 * Generates Misti and Tact versions in src/version-info.ts
 *
 * This needed to avoid reading them from package.json in runtime in order to
 * simplify building the distribution package.
 *
 * @packageDocumentation
 */

import * as fs from "fs";
import * as path from "path";

const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const MISTI_VERSION: string = packageJson.version;
const TACT_COMPILER_VERSION: string =
  packageJson.dependencies["@tact-lang/compiler"];

const normalizeVersion = (version: string): string =>
  version.startsWith("^") || version.startsWith("~")
    ? version.slice(1)
    : version;

const content = `
export const MISTI_VERSION = '${MISTI_VERSION}';
export const TACT_VERSION = '${normalizeVersion(TACT_COMPILER_VERSION)}';
`;

const versionFilePath = path.join(__dirname, "..", "src", "version-info.ts");
fs.writeFileSync(versionFilePath, content.trim(), "utf8");
