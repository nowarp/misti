import fs from "fs-extra";
import path from "path";

export const TEMPLATE_PATH = path.join(
  __dirname,
  "detectors/templates/simple.ts.template",
);

const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);
const lowercase = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

const isCamelCase = (input: string): boolean =>
  /^[a-z][a-zA-Z0-9]*$/.test(input);

/**
 * Returns the directory and filename without the `.ts` extension if the string is a valid `.ts` filepath.
 *
 * @param str The string to evaluate as a possible `.ts` filepath.
 * @returns A tuple containing the directory and filename without the extension, or `DEFAULT_PATH` with the original string if not valid.
 */
function getFileInfo(str: string): [string, string] {
  const defaultResult: [string, string] = ["./src/detectors", lowercase(str)];
  try {
    const normalizedPath = path.normalize(str);
    const ext = path.extname(normalizedPath);
    let filename = path.basename(normalizedPath);
    if (ext === ".ts") {
      filename = path.basename(normalizedPath, ext);
    }
    if (filename.length === 0) {
      return defaultResult;
    }
    return [path.dirname(normalizedPath), filename];
  } catch (error) {
    return defaultResult;
  }
}

/**
 * Creates a new detector from `TEMPLATE_PATH` based on user's input.
 * @param nameOrPath Either detector name (will create the detector in src/detector/detectorName.ts)
 *        or the complete path to the target detector (e.g. /path/to/myDetector.ts).
 * @return true if the detector was successfully created, false otherwise.
 */
export async function createDetector(nameOrPath: string): Promise<boolean> {
  const [dir, detectorName] = getFileInfo(nameOrPath);
  if (!isCamelCase(detectorName)) {
    console.error(
      `"${detectorName}" must be in camelCase format (e.g., implicitInit)`,
    );
    return false;
  }
  const filepath = path.join(dir, `${detectorName}.ts`);
  if (await fs.pathExists(filepath)) {
    console.error(`File already exists at ${filepath}`);
    return false;
  }
  try {
    const templateContent = await fs.readFile(TEMPLATE_PATH, "utf8");
    const content = templateContent.replace(
      /__ClassName__/g,
      capitalize(detectorName),
    );
    await fs.outputFile(filepath, content);
    console.log(
      [
        `Created ${filepath}\n`,
        "Now you can add your detector to the configuration file and execute it. ",
        "See: https://nowarp.io/tools/misti/docs/hacking/custom-detector.",
      ].join(""),
    );
    return true;
  } catch (error) {
    console.error("Error creating detector:", error);
    return false;
  }
}
