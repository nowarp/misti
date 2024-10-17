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

function moveGeneratedFile(projectName: string, format: string) {
  const generatedFile = path.join(ALL_DIR, `${projectName}.DumpCfg.out`);
  const targetFile = path.join(ALL_DIR, `${projectName}.${format}`);
  if (fs.existsSync(generatedFile)) {
    fs.renameSync(generatedFile, targetFile);
  } else {
    throw new Error(`File ${generatedFile} was not generated`);
  }
}

function processSingleFile(file: string) {
  const contractName = file.replace(".tact", "");
  const filePath = path.join(ALL_DIR, file);
  const nameBase = path.join(ALL_DIR, contractName);
  describe(`Testing CFG dump for ${contractName}`, () => {
    const testCfgDump = (format: string, extension: string) => {
      it(`should produce correct CFG ${format.toUpperCase()} output for ${contractName}`, async () => {
        resetIds();
        const result = await runMistiCommand([
          "--output-path",
          ALL_DIR,
          "-t",
          `DumpCfg:format=${format}`,
          "--no-colors",
          filePath,
        ]);
        handleMistiResult(result![0], result![1]);
        moveGeneratedFile(contractName, extension);
        await TAP.from(nameBase, extension, `cfg.${extension}`).run();
      });
    };
    testCfgDump("json", "json");
    testCfgDump("dot", "dot");
    testCfgDump("mmd", "mmd");
  });
}

const filePathArg = getFilePathArg();
if (filePathArg) {
  // Run test for a single file
  const fullPath = path.relative(ALL_DIR, filePathArg);
  processSingleFile(fullPath);
} else {
  // Run all tests
  processTactFiles(ALL_DIR, (file) => {
    processSingleFile(file);
  });
}
