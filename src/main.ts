import { Command } from "commander";
import * as packageJson from "../package.json";

import { run } from "./driver";

const command = new Command();

command
  .name("misti")
  .description("TON Static Analyzer")
  .version(packageJson.version)
  .arguments("<TACT_CONFIG_PATH>")
  .action((TACT_CONFIG_PATH) => {
    run(TACT_CONFIG_PATH);
  });
command.option("--help", "display help for command", () => {
  command.help();
});

command.parse(process.argv);
