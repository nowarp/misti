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
 * Creates a new detector from `TEMPLATE_PATH` based on user's input.
 * @return true if the detector was successfully created, false otherwise.
 */
export async function createDetector(params: {
  className: string;
}): Promise<boolean> {
  if (!isCamelCase(params.className)) {
    console.error("Name must be in camelCase format (e.g., implicitInit)");
    return false;
  }
  const filepath = path.join(
    "src",
    "detectors",
    `${lowercase(params.className)}.ts`,
  );
  try {
    const templateContent = await fs.readFile(TEMPLATE_PATH, "utf8");
    const content = templateContent.replace(
      /__ClassName__/g,
      capitalize(params.className),
    );
    await fs.outputFile(filepath, content);
    console.log(`Created ${filepath}`);
    return true;
  } catch (error) {
    console.error("Error creating detector:", error);
    return false;
  }
}
