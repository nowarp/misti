import { run } from "../src/driver";
import { describe, it } from "@jest/globals";
import { TAP, processTactFiles, CONTRACTS_DIR } from "./testUtil";
import path from "path";

processTactFiles(CONTRACTS_DIR, (file) => {
  const contractName = file.replace(".tact", "");
  describe(`Testing CFG dump for ${contractName}`, () => {
    it(`should produce the correct CFG JSON output for ${contractName}`, async () => {
      await run(path.join(CONTRACTS_DIR, file), {
        dumpCfg: "json",
        dumpCfgStdlib: false,
        dumpCfgOutput: CONTRACTS_DIR,
        quiet: true,
      });
      await TAP.from(contractName, "json", "cfg.json").run();
    });
  });
});
