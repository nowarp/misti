import { IdxGenerator } from "../src/internals/ir";
import { __DANGER_resetNodeId } from "@tact-lang/compiler/dist/grammar/ast";
import { expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

export const GOOD_DIR = path.resolve(__dirname, "good");
export const BAD_DIR = path.resolve(__dirname, "bad");

/**
 * Provides a minimal TAP-like API.
 */
export class TAP {
  private constructor(
    private filePath: string,
    private actualSuffix: string,
    private expectedSuffix: string,
  ) {}
  /**
   * @param filePath Absolute path to the tested file without an extension.
   */
  static from(
    filePath: string,
    actualSuffix: string,
    expectedSuffix: string,
  ): TAP {
    return new TAP(filePath, actualSuffix, expectedSuffix);
  }

  async run(): Promise<void> {
    if (process.env.BLESS === "1") {
      // Bless test outputs if requested
      return this.bless();
    } else {
      // Otherwise, compare results
      return this.compareOutputs();
    }
  }

  /**
   * Compares outputs after running the command.
   */
  async compareOutputs(): Promise<void> {
    const actualPath = `${this.filePath}.${this.actualSuffix}`;
    const expectedPath = `${this.filePath}.${this.expectedSuffix}`;
    const [actual, expected] = await Promise.all([
      fs.promises.readFile(actualPath, "utf8"),
      fs.promises.readFile(expectedPath, "utf8"),
    ]);
    expect(actual.trim()).toBe(expected.trim());
  }

  /**
   * Saves TAP outputs as expected results.
   */
  async bless(): Promise<void> {
    const actualPath = `${this.filePath}.${this.actualSuffix}`;
    const expectedPath = `${this.filePath}.${this.expectedSuffix}`;
    const actualOutput = await fs.promises.readFile(actualPath, "utf8");
    await fs.promises.writeFile(expectedPath, actualOutput);
  }
}

if (process.env.BLESS === "1") {
  console.log(`Updating expected outputs...`);
}

/**
 * Runs `callback` on each file in the contracts directory.
 */
export function processTactFiles(
  directory: string,
  callback: (file: string) => void,
): void {
  fs.readdirSync(directory)
    .filter((file) => file.endsWith(".tact"))
    .forEach(callback);
}

/**
 * Name of the Tact configuration file used in the test projects.
 */
export const TACT_CONFIG_NAME = "tact.config.json";

/**
 * Runs `callback` on each directory in the contracts directory that contains a
 * `config.tact.json` file.
 */
export function processTactProjects(
  directory: string,
  callback: (file: string) => void,
): void {
  fs.readdirSync(directory, { withFileTypes: true })
    .filter((dentry) => dentry.isDirectory())
    .map((dentry) => path.join(directory, dentry.name))
    .filter((dir) => fs.existsSync(path.join(dir, TACT_CONFIG_NAME)))
    .forEach(callback);
}

/***
 * Resets IDs, making the names and IDs in the expected dump files consistent when adding new tests.
 */
export function resetIds(): void {
  __DANGER_resetNodeId();
  IdxGenerator.__reset();
}
