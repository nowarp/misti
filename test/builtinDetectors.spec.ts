import { describe, it } from "@jest/globals";
import {
  TAP,
  processTactFiles,
  processTactProjects,
  GOOD_DIR,
  TACT_CONFIG_NAME,
  resetIds,
  executeMisti,
} from "./testUtil";
import fs from "fs";
import path from "path";

/**
 * Runs a test for a single contract or a Tact project.
 * @param filePath Absolute path to input file for Misti.
 * @param nameBase Path base to create expected/actual files.
 * @param testName Name of the test to display.
 */
function runTestForFile(filePath: string, nameBase: string, testName: string) {
  const actualSuffix = "actual.out";
  const outputFilePath = `${nameBase}.${actualSuffix}`;
  describe(`Testing built-in detectors for ${testName}`, () => {
    it(`should generate the expected warnings for ${testName}`, async () => {
      resetIds();
      const output = await executeMisti(["--all-detectors", filePath]);
      fs.writeFileSync(outputFilePath, output);
      await TAP.from(nameBase, actualSuffix, "expected.out").run();
    }, 30000);
  });
}

processTactFiles(GOOD_DIR, (file) => {
  const contractName = file.replace(".tact", "");
  const contractPath = path.join(GOOD_DIR, file);
  const nameBase = path.join(GOOD_DIR, contractName);
  runTestForFile(contractPath, nameBase, contractName);
});

processTactProjects(GOOD_DIR, (projectDir) => {
  const projectName = path.basename(projectDir);
  const projectConfigPath = path.join(projectDir, TACT_CONFIG_NAME);
  const nameBase = path.join(projectDir, projectName);
  runTestForFile(projectConfigPath, nameBase, projectName);
});
