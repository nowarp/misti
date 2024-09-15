import { Runner, MistiResult } from "./driver";
import { ExecutionException } from "./internals/exceptions";
import { MISTI_VERSION, TACT_VERSION } from "./version";
import { Command, Option } from "commander";
import { createDetector } from "./createDetector";

/**
 * A runner object used for this execution.
 */
let RUNNER: Runner | undefined = undefined;

export const DUMP_STDOUT_PATH = "-";

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

/**
 * Creates and configures the Misti CLI command.
 * @returns The configured commander Command instance.
 */
export function createMistiCommand(): Command {
  const command = new Command();

  command
    .name("misti")
    .description("TON Static Analyzer")
    .version(`${MISTI_VERSION}\n\nSupported Tact version: ${TACT_VERSION}`)
    .arguments("[TACT_CONFIG_PATH|TACT_FILE_PATH]");
  cliOptions.forEach((option) => command.addOption(option));
  command.action(async (PROJECT_CONFIG_OR_FILE_PATH, options) => {
    if (options.newDetector) {
      createDetector(options.newDetector);
      return;
    }

    if (!PROJECT_CONFIG_OR_FILE_PATH) {
      throw ExecutionException.make(
        "`<TACT_CONFIG_PATH|TACT_FILE_PATH>` is required",
      );
    }

    RUNNER = await Runner.make(PROJECT_CONFIG_OR_FILE_PATH, options);
    await RUNNER.run();
  });

  return command;
}

/**
 * Runs the Misti CLI command with the provided arguments.
 * @param The list of arguments to pass to the CLI command.
 */
export async function runMistiCommand(
  args: string[],
): Promise<MistiResult | undefined> {
  const command = createMistiCommand();
  if (args.length === 0) {
    command.help();
    throw ExecutionException.make("No arguments provided. Help displayed.");
  } else {
    await command.parseAsync(args, { from: "user" });
    return RUNNER === undefined ? undefined : RUNNER!.getResult();
  }
}

/**
 * Executes Misti with the given options capturing output.
 */
export async function executeMisti(args: string[]): Promise<string> {
  const result = await runMistiCommand(args);
  return result?.output ?? "";
}

/** Reports errors found by Misti. */
export function report(result?: MistiResult) {
  if (
    RUNNER !== undefined &&
    result !== undefined &&
    result.output !== undefined
  ) {
    // Use the configured logger to report the found errors
    RUNNER.getDriver().ctx.logger.error(result.output);
  }
}
