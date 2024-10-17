import {
  ALL_DIR,
  TAP,
  processTactFiles,
  resetIds,
  getFilePathArg,
} from "./testUtil";
import { runMistiCommand, handleMistiResult } from "../src/cli";
import path from "path";
import * as fs from "fs";

const actualSuffix = (toolName: string, format: string): string =>
  `${toolName.replace(/^Dump/, "").toLowerCase()}.${format}`;
const expectedSuffix = (toolName: string, format: string): string =>
  `expected.${actualSuffix(toolName, format)}`;

/**
 * Moves the generated output file to the correct location with the proper naming convention.
 */
function moveGeneratedFile(
  projectName: string,
  toolName: string,
  format: string,
): void {
  const generatedFile = path.join(ALL_DIR, `${projectName}.${toolName}.out`);
  const targetFile = path.join(
    ALL_DIR,
    `${projectName}.${actualSuffix(toolName, format)}`,
  );
  if (fs.existsSync(generatedFile)) {
    fs.renameSync(generatedFile, targetFile);
  } else {
    throw new Error(`File ${generatedFile} was not generated`);
  }
}

/**
 * Sets up and runs tests for a specific dump tool across multiple output formats.
 */
function testDumpForTool(
  contractName: string,
  filePath: string,
  toolName: string,
  formats: string[],
): void {
  const baseName = toolName.replace(/^Dump/, "").toLowerCase();
  describe(`Testing ${baseName} dump for ${contractName}`, () => {
    formats.forEach((format: string) => {
      it(`should produce correct ${baseName.toUpperCase()} ${format.toUpperCase()} output for ${contractName}`, async () => {
        resetIds();
        const result = await runMistiCommand([
          "--output-path",
          ALL_DIR,
          "-t",
          `${toolName}:format=${format}`,
          "--no-colors",
          filePath,
        ]);
        handleMistiResult(result![0], result![1]);
        moveGeneratedFile(contractName, toolName, format);
        await TAP.from(
          path.join(ALL_DIR, contractName),
          actualSuffix(toolName, format),
          expectedSuffix(toolName, format),
        ).run();
      });
    });
  });
}

/**
 * Processes a single Tact file, running tests for all specified tools and formats.
 */
function processSingleFile(file: string): void {
  const contractName = file.replace(".tact", "");
  const filePath = path.join(ALL_DIR, file);

  const tools: string[] = ["DumpCfg", "DumpImports"];
  const formats: string[] = ["json", "dot", "mmd"];

  tools.forEach((toolName: string) => {
    testDumpForTool(contractName, filePath, toolName, formats);
  });
}

const filePathArg = getFilePathArg();
if (filePathArg) {
  // Run test for a single file
  const fullPath = path.relative(ALL_DIR, filePathArg);
  processSingleFile(fullPath);
} else {
  // Run all tests
  processTactFiles(ALL_DIR, (file: string) => {
    processSingleFile(file);
  });
}
