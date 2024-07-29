import { run } from "../src/driver";
import { IdxGenerator } from "../src/internals/ir";
import { TAP, processTactFiles, CONTRACTS_DIR } from "./testUtil";
import path from "path";

processTactFiles(CONTRACTS_DIR, (file) => {
  const contractName = file.replace(".tact", "");
  describe(`Testing CFG dump for ${contractName}`, () => {
    it(`should produce correct CFG JSON output for ${contractName}`, async () => {
      IdxGenerator.__reset();
      await run(path.join(CONTRACTS_DIR, file), {
        dumpCfg: "json",
        dumpCfgStdlib: false,
        dumpCfgOutput: CONTRACTS_DIR,
        quiet: true,
      });
      await TAP.from(contractName, "json", "cfg.json").run();
    });
    it(`should produce correct CFG DOT output for ${contractName}`, async () => {
      IdxGenerator.__reset();
      await run(path.join(CONTRACTS_DIR, file), {
        dumpCfg: "dot",
        dumpCfgStdlib: false,
        dumpCfgOutput: CONTRACTS_DIR,
        quiet: true,
      });
      await TAP.from(contractName, "dot", "cfg.dot").run();
    });
  });
});
