import * as fs from "fs";
import * as path from "path";
import { expect } from "@jest/globals";

export const GOOD_DIR = path.resolve(__dirname, "good");
export const BAD_DIR = path.resolve(__dirname, "bad");

/**
 * Provides a minimal TAP-like API.
 */
export class TAP {
  constructor(
    private contractName: string,
    private actualSuffix: string,
    private expectedSuffix: string,
  ) {}

  static from(
    contractName: string,
    actualSuffix: string,
    expectedSuffix: string,
  ): TAP {
    return new TAP(contractName, actualSuffix, expectedSuffix);
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
    const actualPath = path.join(
      GOOD_DIR,
      `${this.contractName}.${this.actualSuffix}`,
    );
    const expectedPath = path.join(
      GOOD_DIR,
      `${this.contractName}.${this.expectedSuffix}`,
    );
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
    const actualPath = path.join(
      GOOD_DIR,
      `${this.contractName}.${this.actualSuffix}`,
    );
    const expectedPath = path.join(
      GOOD_DIR,
      `${this.contractName}.${this.expectedSuffix}`,
    );
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
