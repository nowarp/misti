import {
  GOOD_DIR,
  TACT_CONFIG_NAME,
  TAP,
  processTactFiles,
  processTactProjects,
  resetIds,
  getFilePathArg,
} from "./testUtil";
import { executeMisti } from "../src/cli";
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
      const output = await executeMisti([
        "--all-detectors",
        "--no-colors",
        filePath,
      ]);
      fs.writeFileSync(outputFilePath, output);
      await TAP.from(nameBase, actualSuffix, "expected.out").run();
    }, 30000);
  });
}

function processSingleFile(filePath: string) {
  const contractName = path.basename(filePath).replace(".tact", "");
  const contractPath = path.resolve(filePath);
  const nameBase = path.join(path.dirname(contractPath), contractName);
  runTestForFile(contractPath, nameBase, contractName);
}

function processProjectDir(projectDir: string) {
  const projectName = path.basename(projectDir);
  const projectConfigPath = path.join(projectDir, TACT_CONFIG_NAME);
  const nameBase = path.join(projectDir, projectName);
  runTestForFile(projectConfigPath, nameBase, projectName);
}

const filePathArg = getFilePathArg();
if (filePathArg) {
  // Run test for a single file
  const fullPath = path.resolve(filePathArg);
  const stats = fs.statSync(fullPath);
  if (stats.isFile()) {
    processSingleFile(fullPath);
  } else if (stats.isDirectory()) {
    processProjectDir(fullPath);
  } else {
    throw new Error("Invalid file path argument");
  }
} else {
  // Run all tests
  processTactFiles(GOOD_DIR, (file) => {
    const filePath = path.join(GOOD_DIR, file);
    processSingleFile(filePath);
  });
  processTactProjects(GOOD_DIR, (projectDir) => {
    processProjectDir(projectDir);
  });
}
