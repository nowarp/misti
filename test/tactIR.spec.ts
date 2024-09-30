import {
  GOOD_DIR,
  TAP,
  processTactFiles,
  resetIds,
  getFilePathArg,
} from "./testUtil";
import { Runner } from "../src/cli";
import path from "path";
import fs from "fs";

function moveGeneratedFile(contractName: string, format: string) {
  const generatedFile = path.join(GOOD_DIR, `dumpCfg.${format}`);
  const targetFile = path.join(GOOD_DIR, `${contractName}.cfg.${format}`);
  if (fs.existsSync(generatedFile)) {
    fs.renameSync(generatedFile, targetFile);
  }
}

function processSingleFile(file: string) {
  const contractName = file.replace(".tact", "");
  const filePath = path.join(GOOD_DIR, file);
  const nameBase = path.join(GOOD_DIR, contractName);
  describe(`Testing CFG dump for ${contractName}`, () => {
    it(`should produce correct CFG JSON output for ${contractName}`, async () => {
      resetIds();
      const runner = await Runner.make(filePath, {
        tools: [{ className: "DumpCfg", options: { format: "json" } }],
        outputPath: GOOD_DIR,
        quiet: true,
      });
      await runner.run();
      moveGeneratedFile(contractName, "json");
      await TAP.from(nameBase, "json", "cfg.json").run();
    });
    it(`should produce correct CFG DOT output for ${contractName}`, async () => {
      resetIds();
      const runner = await Runner.make(filePath, {
        tools: [{ className: "DumpCfg", options: { format: "dot" } }],
        outputPath: GOOD_DIR,
        quiet: true,
      });
      await runner.run();
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
