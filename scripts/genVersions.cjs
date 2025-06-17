/**
 * Generates Misti and Tact versions in `src/version-info.ts`.
 *
 * This is needed to avoid reading them from `package.json` at runtime to
 * simplify building the distribution package.
 *
 * **Note:** If the `MISTI_RELEASE` environment variable is set to `'1'`, the
 * Git revision will not be included in the version string.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const packageVersion = packageJson.version;

// Initialize MISTI_VERSION with packageVersion
let MISTI_VERSION = packageVersion;

if (process.env.MISTI_RELEASE !== "1") {
  // Retrieve the Git revision number
  let gitRevision = "unknown";
  try {
    gitRevision = execSync("git rev-parse --short master").toString().trim();
  } catch (error) {
    console.warn("Could not retrieve Git revision:", error);
  }

  // Combine the package version with the Git revision
  MISTI_VERSION = `${packageVersion}-${gitRevision}`;
}

const TACT_COMPILER_VERSION = packageJson.dependencies["@tact-lang/compiler"];

const normalizeVersion = (version) =>
    version.startsWith("^") || version.startsWith("~") ? version.slice(1)
                                                       : version;

const content = `
export const MISTI_VERSION = '${MISTI_VERSION}';
export const TACT_VERSION = '${normalizeVersion(TACT_COMPILER_VERSION)}';
`;

const versionFilePath = path.join(__dirname, "..", "src", "version-info.ts");
fs.writeFileSync(versionFilePath, content.trim(), "utf8");
