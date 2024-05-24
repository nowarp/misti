import { run } from "../src/driver";
import { describe, it } from "@jest/globals";

import {
  generateConfig,
  TAP,
  processTactFiles,
  CONTRACTS_DIR,
} from "./testUtil";

processTactFiles(CONTRACTS_DIR, (file) => {
  const contractName = file.replace(".tact", "");
  describe(`Testing CFG dump for ${contractName}`, () => {
    it(`should produce the correct CFG JSON output for ${contractName}`, async () => {
      const configPath = await generateConfig(contractName);
      await run(configPath, {
        dumpCfg: "json",
        dumpCfgStdlib: false,
        dumpCfgOutput: CONTRACTS_DIR,
        quiet: true,
      });
      await TAP.from(contractName, "json", "cfg.json").run();
    });
  });
});
