import { Command } from "commander";
import * as packageJson from "../package.json";

import { run } from "./driver";

const command = new Command();

command
  .name("misti")
  .description("TON Static Analyzer")
  .version(packageJson.version)
  .arguments("<TACT_CONFIG_PATH|TACT_FILE_PATH>")
  .option("--dump-cfg <type>", "Dump CFG in format: 'json' or 'dot'", undefined)
  .option(
    "--dump-cfg-stdlib",
    "Include standard library components in the CFG dump",
    false,
  )
  .option(
    "--dump-cfg-output <path>",
    "Directory to save CFG dump. If <path> is `-` then stdout is used.",
    "-",
  )
  .option(
    "--souffle-path <path>",
    "Directory to save generated Soufflé files. If not set, a temporary directory will be used.",
    undefined,
  )
  .option("--verbose", "Enable verbose output.", false)
  .option("--quiet", "Suppress output.", false)
  .option("--config <path>", "Path to Misti configuration file")
  .action((PROJECT_CONFIG_OR_FILE_PATH, options) => {
    run(PROJECT_CONFIG_OR_FILE_PATH, options);
  });
command.option("--help", "Display help for command", () => {
  command.help();
});

command.parse(process.argv);
