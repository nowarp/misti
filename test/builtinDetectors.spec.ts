import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { describe, it } from "@jest/globals";

import {
  generateConfig,
  TAP,
  processTactFiles,
  CONTRACTS_DIR,
} from "./testUtil";

processTactFiles(CONTRACTS_DIR, (file) => {
  const contractName = file.replace(".tact", "");
  const actualSuffix = "actual.out";
  describe(`Testing built-in detectors for ${contractName}`, () => {
    it(`should generate the expected warnings for ${contractName}`, async () => {
      const configPath = await generateConfig(contractName);

      // Run the driver and save results to the file.
      const outputFilePath = path.join(
        CONTRACTS_DIR,
        `${contractName}.${actualSuffix}`,
      );
      const runCommand = `node dist/src/main.js ${configPath}`;
      await new Promise((resolve, reject) => {
        exec(runCommand, (error, stdout, stderr) => {
          fs.writeFileSync(outputFilePath, stdout + stderr);
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
