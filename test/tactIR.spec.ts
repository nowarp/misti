import {
  GOOD_DIR,
  TAP,
  processTactFiles,
  resetIds,
  getFilePathArg,
} from "./testUtil";
import { runMistiCommand, handleMistiResult } from "../src/cli";
import path from "path";
import * as fs from "fs";

function moveGeneratedFile(projectName: string, format: string) {
  const generatedFile = path.join(GOOD_DIR, `${projectName}.DumpCfg.out`);
  const targetFile = path.join(GOOD_DIR, `${projectName}.${format}`);
  if (fs.existsSync(generatedFile)) {
    fs.renameSync(generatedFile, targetFile);
  } else {
    throw new Error(`File ${generatedFile} was not generated`);
  }
}

function processSingleFile(file: string) {
  const contractName = file.replace(".tact", "");
  const filePath = path.join(GOOD_DIR, file);
  const nameBase = path.join(GOOD_DIR, contractName);
  describe(`Testing CFG dump for ${contractName}`, () => {
    it(`should produce correct CFG JSON output for ${contractName}`, async () => {
      resetIds();
      const result = await runMistiCommand([
        "--output-path",
        GOOD_DIR,
        "-t",
        "DumpCfg:format=json",
        "--no-colors",
        filePath,
      ]);
      handleMistiResult(result);
      moveGeneratedFile(contractName, "json");
      await TAP.from(nameBase, "json", "cfg.json").run();
    });
    it(`should produce correct CFG DOT output for ${contractName}`, async () => {
      resetIds();
      const result = await runMistiCommand([
        "-t",
        "DumpCfg:format=dot",
        "--output-path",
        GOOD_DIR,
        "--no-colors",
        filePath,
      ]);
      handleMistiResult(result);
      moveGeneratedFile(contractName, "dot");
      await TAP.from(nameBase, "dot", "cfg.dot").run();
    });
  });
}

const filePathArg = getFilePathArg();
if (filePathArg) {
  // Run test for a single file
  const fullPath = path.relative(GOOD_DIR, filePathArg);
  processSingleFile(fullPath);
} else {
  // Run all tests
  processTactFiles(GOOD_DIR, (file) => {
    processSingleFile(file);
  });
}
