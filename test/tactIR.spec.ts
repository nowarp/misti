import { run } from "../src/driver";
import { TAP, processTactFiles, GOOD_DIR, resetIds } from "./testUtil";
import path from "path";

processTactFiles(GOOD_DIR, (file) => {
  const contractName = file.replace(".tact", "");
  const filePath = path.join(GOOD_DIR, file);
  const nameBase = path.join(GOOD_DIR, contractName);
  describe(`Testing CFG dump for ${contractName}`, () => {
    it(`should produce correct CFG JSON output for ${contractName}`, async () => {
      resetIds();
      await run(filePath, {
        dumpCfg: "json",
        dumpCfgStdlib: false,
        dumpCfgOutput: GOOD_DIR,
        quiet: true,
      });
      await TAP.from(nameBase, "json", "cfg.json").run();
    });
    it(`should produce correct CFG DOT output for ${contractName}`, async () => {
      resetIds();
      await run(filePath, {
        dumpCfg: "dot",
        dumpCfgStdlib: false,
        dumpCfgOutput: GOOD_DIR,
        quiet: true,
      });
      await TAP.from(nameBase, "dot", "cfg.dot").run();
    });
  });
});
