import { Command } from "commander";
import * as packageJson from "../package.json";

import { run } from "./driver";

const command = new Command();

command
  .name("misti")
  .description("TON Static Analyzer")
  .version(packageJson.version)
  .arguments("<TACT_CONFIG_PATH>")
  .option("--dump <type>", "Dump CFG in format: 'json' or 'dot'", [
    "json",
    "dot",
  ])
  .option("--config <path>", "Path to Misti configuration file")
  .action((TACT_CONFIG_PATH, options) => {
    run(TACT_CONFIG_PATH, options);
  });
command.option("--help", "display help for command", () => {
  command.help();
});

command.parse(process.argv);
