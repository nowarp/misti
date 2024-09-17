import { Option } from "commander";

export const DUMP_STDOUT_PATH = "-";

export interface CLIOptions {
  dumpCfg?: "json" | "dot";
  dumpCfgStdlib?: boolean;
  dumpCfgOutput?: string;
  dumpConfig?: boolean;
  dumpAst?: boolean;
  soufflePath?: string;
  souffleBinary?: string;
  souffleVerbose?: boolean;
  tactStdlibPath?: string;
  verbose?: boolean;
  quiet?: boolean;
  detectors?: string[];
  allDetectors?: boolean;
  config?: string;
}

export const cliOptions = [
  new Option(
    "--dump-cfg <json|dot>",
    "Print Control Flow Graph in the requested format: JSON or Graphviz Dot",
  ).default(undefined),
  new Option(
    "--dump-cfg-stdlib",
    "Include standard library components in the CFG dump",
  ).default(false),
  new Option(
    "--dump-cfg-output <PATH>",
    "Directory to save the CFG dump. If <PATH> is `-`, then stdout is used.",
  ).default(DUMP_STDOUT_PATH),
  new Option(
    "--dump-config",
    "Dump the Misti JSON configuration file in use.",
  ).default(false),
  new Option("--souffle-binary <PATH>", "Path to the Soufflé binary.").default(
    "souffle",
  ),
  new Option(
    "--souffle-path <PATH>",
    "Directory to save generated Soufflé files.",
  ).default("/tmp/misti/souffle"),
  new Option(
    "--souffle-verbose",
    "Generate human-readable, but more verbose, Soufflé files.",
  ).default(false),
  new Option("--tact-stdlib-path <PATH>", "Path to the Tact standard library."),
  new Option("--verbose", "Enable verbose output.").default(false),
  new Option("--quiet", "Suppress output.").default(false),
  new Option(
    "--detectors <name|path:name>",
    "A comma-separated list of detectors to enable.",
  )
    .argParser((value) => {
      const detectors = value.split(",").map((detector) => detector.trim());
      if (detectors.length === 0) {
        throw new Error(
          "The --detectors option requires a non-empty list of detector names.",
        );
      }
      return detectors;
    })
    .default(undefined),
  new Option(
    "--all-detectors",
    "Enable all the available built-in detectors.",
  ).default(false),
  new Option("--config <PATH>", "Path to the Misti configuration file."),
  new Option("--new-detector <PATH>", "Creates a new custom detector.").default(
    undefined,
  ),
];
