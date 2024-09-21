import { Option } from "commander";

export const DUMP_STDOUT_PATH = "-";

export interface CLIOptions {
  dumpCfg?: "json" | "dot";
  dumpAst?: boolean;
  dumpIncludeStdlib?: boolean;
  dumpOutput?: string;
  dumpConfig?: boolean;
  soufflePath?: string;
  souffleBinary?: string;
  souffleVerbose?: boolean;
  tactStdlibPath?: string;
  verbose?: boolean;
  quiet?: boolean;
  detectors?: string[];
  suppress?: string[];
  allDetectors?: boolean;
  config?: string;
}

export const cliOptions = [
  new Option(
    "--dump-cfg <json|dot>",
    "Dump Control Flow Graph (CFG) in the requested format: JSON or Graphviz Dot",
  ).default(undefined),
  new Option(
    "--dump-ast",
    "Dump Abstract Syntax Tree (AST) in the JSON format",
  ).default(false),
  new Option(
    "--dump-output <PATH>",
    "Directory to save the AST/CFG dump. If <PATH> is `-`, then stdout is used.",
  ).default(DUMP_STDOUT_PATH),
  new Option(
    "--dump-include-stdlib",
    "Include standard library components in the AST/CFG dump",
  ).default(false),
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
    "--suppress <names>",
    "A comma-separated list of names of detectors to suppress.",
  )
    .argParser((value) => {
      const detectors = value.split(",").map((detector) => detector.trim());
      if (detectors.length === 0) {
        throw new Error(
          "The --suppress option requires a non-empty list of detector names.",
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
