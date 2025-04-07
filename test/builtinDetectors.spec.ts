import {
  ALL_DIR,
  DETECTORS_DIR,
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
import { getAllDetectors } from "../src/detectors/detector";

/**
 * Runs a test for a single contract or a Tact project with the expected output.
 *
 * @param filePath Absolute path to input file for Misti.
 * @param nameBase Path base to create expected/actual files.
 * @param testName Name of the test to display.
 * @param detectorName Optional detector name to enable.
 */
function runTestForFile(
  filePath: string,
  nameBase: string,
  testName: string,
  outputFormat: "json" | "plain",
  detectorName?: string,
) {
  const actualSuffix = `actual.${outputFormat === "json" ? "json" : "out"}`;
  const outputFilePath = `${nameBase}.${actualSuffix}`;
  describe(`Testing built-in detectors for ${testName}`, () => {
    it(`should generate the expected warnings for ${testName}`, async () => {
      resetIds();
      const executeArgs = [
        "--no-colors",
        filePath,
        "--output-format",
        outputFormat,
      ];
      if (detectorName) {
        executeArgs.unshift("--enabled-detectors", detectorName);
      } else {
        executeArgs.unshift("--all-detectors");
      }
      const output = await executeMisti(executeArgs);
      fs.writeFileSync(outputFilePath, output);
      await TAP.from(
        nameBase,
        actualSuffix,
        `expected.${outputFormat === "json" ? "json" : "out"}`,
      ).run();
    }, 30000);
  });
}

function processSingleFile(filePath: string, outputFormat: "json" | "plain") {
  const contractName = path.basename(filePath).replace(".tact", "");
  const contractPath = path.resolve(filePath);
  const nameBase = path.join(path.dirname(contractPath), contractName);
  runTestForFile(contractPath, nameBase, contractName, outputFormat);
}

function processProjectDir(projectDir: string) {
  const projectName = path.basename(projectDir);
  const projectConfigPath = path.join(projectDir, TACT_CONFIG_NAME);
  const nameBase = path.join(projectDir, projectName);
  runTestForFile(projectConfigPath, nameBase, projectName, "plain");
}

/**
 * Processes a single detector test file.
 *
 * @param filePath Absolute path to the detector test file.
 */
function processSingleDetectorFile(filePath: string) {
  const fileName = path.basename(filePath);
  const detectorName = fileName.replace(".tact", ""); // Extract detector name
  const contractPath = path.resolve(filePath);
  const nameBase = path.join(path.dirname(contractPath), detectorName);
  runTestForFile(contractPath, nameBase, detectorName, "plain", detectorName);
}

const filePathArg = getFilePathArg(DETECTORS_DIR);
if (filePathArg) {
  // Run test for a single file
  const fullPath = path.resolve(filePathArg);
  const stats = fs.statSync(fullPath);
  if (stats.isFile()) {
    if (fullPath.includes(DETECTORS_DIR)) {
      processSingleDetectorFile(fullPath);
    } else {
      processSingleFile(fullPath, "plain");
    }
  } else if (stats.isDirectory()) {
    processProjectDir(fullPath);
  } else {
    throw new Error("Invalid file path argument");
  }
} else {
  // Run all tests in 'all' directory
  processTactFiles(ALL_DIR, (file) => {
    const filePath = path.join(ALL_DIR, file);
    processSingleFile(filePath, "plain");
    processSingleFile(filePath, "json");
  });
  processTactProjects(ALL_DIR, (projectDir) => {
    processProjectDir(projectDir);
  });

  // Run all tests in 'detectors' directory
  processTactFiles(DETECTORS_DIR, (file) => {
    const filePath = path.join(DETECTORS_DIR, file);
    processSingleDetectorFile(filePath);
  });
}

if (!filePathArg) {
  describe("Built-in Detectors Tests", () => {
    it("should have test contracts for all built-in detectors", () => {
      const allDetectors = getAllDetectors();
      const testFiles = fs
        .readdirSync(DETECTORS_DIR)
        .filter((file) => file.endsWith(".tact"));
      const missingTests = allDetectors.filter((detector) => {
        const expectedTestFile = `${detector}.tact`;
        return !testFiles.includes(expectedTestFile);
      });
      expect(missingTests).toEqual([]);
    });
  });
}
