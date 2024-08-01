import { exec } from "child_process";
import { describe, it } from "@jest/globals";
import { TAP, processTactFiles, GOOD_DIR, resetIds } from "./testUtil";
import fs from "fs";
import path from "path";

processTactFiles(GOOD_DIR, (file) => {
  const contractName = file.replace(".tact", "");
  const actualSuffix = "actual.out";
  describe(`Testing built-in detectors for ${contractName}`, () => {
    it(`should generate the expected warnings for ${contractName}`, async () => {
      resetIds();
      // Run the driver and save results to the file.
      const outputFilePath = path.join(
        GOOD_DIR,
        `${contractName}.${actualSuffix}`,
      );
      const runCommand = `node dist/src/main.js ${path.join(GOOD_DIR, file)}`;
      await new Promise((resolve, reject) => {
        exec(runCommand, (error, stdout, stderr) => {
          const out = stdout.trim() + stderr.trim();
          fs.writeFileSync(outputFilePath, out ? out : "\n");
          if (error) {
            reject(error);
          } else {
            resolve(void 0);
          }
        });
      });

      await TAP.from(contractName, actualSuffix, "expected.out").run();
    }, 30000);
  });
});
