import { Runner, MistiResult } from "./driver";
import { MISTI_VERSION, TACT_VERSION } from "./version";
import { Command } from "commander";
import { createDetector } from "./createDetector";

/**
 * A runner object used for this execution.
 */
let RUNNER: Runner | undefined = undefined;

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
    .arguments("[TACT_CONFIG_PATH|TACT_FILE_PATH]")
    .option(
      "--dump-cfg <type>",
      "Dump CFG in format: 'json' or 'dot'",
      undefined,
    )
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
      "--dump-config",
      "Dump the used Misti JSON configuration file. If no custom configuration available, dumps the default config.",
      false,
    )
    .option(
      "--souffle-binary <path>",
      "Path to Soufflé binary. Default: `souffle`.",
      undefined,
    )
    .option(
      "--souffle-path <path>",
      "Directory to save generated Soufflé files. If not set, a temporary directory will be used. Default: `/tmp/misti/souffle`",
      undefined,
    )
    .option(
      "--souffle-verbose",
      "If set, generates more readable Soufflé files instead of making the result source code smaller.",
      undefined,
    )
    .option(
      "--tact-stdlib-path <path>",
      "Path to Tact standard library. If not set, the default stdlib from the actual Tact setup will be used.",
      undefined,
    )
    .option("--verbose", "Enable verbose output.", false)
    .option("--quiet", "Suppress output.", false)
    .option(
      "--detectors <name|path:name>",
      [
        "A comma-separated list of detectors to enable.",
        "If set, these detectors will override those specified in the configuration file.",
        "Format: `<name>` for built-in detectors (e.g., `ReadOnlyVariables`), and `<path:name>` for custom detectors (e.g., `./examples/implicit-init/implicitInit.ts:ImplicitInit`).",
      ].join(" "),
      (value) => {
        const detectors = value
          .split(",")
          .filter((detector) => detector.trim() !== "");
        if (detectors.length === 0) {
          throw new Error(
            "The --detectors option requires a non-empty list of detector names.",
          );
        }
        return detectors;
      },
    )
    .option(
      "--all-detectors",
      [
        "Enable all the available built-in detectors.",
        "If set, this option will override those detectors specified in the configuration file.",
      ].join(" "),
      false,
    )
    .option("--config <path>", "Path to Misti configuration file")
    .option(
      "--new-detector <path>",
      "Creates a new custom detector.",
      undefined,
    )
    .action(async (PROJECT_CONFIG_OR_FILE_PATH, options) => {
      if (options.newDetector) {
        createDetector(options.newDetector);
        return;
      }

      if (!PROJECT_CONFIG_OR_FILE_PATH) {
        throw new Error("`<TACT_CONFIG_PATH|TACT_FILE_PATH>` is required");
      }

      try {
        RUNNER = await Runner.make(PROJECT_CONFIG_OR_FILE_PATH, options);
        await RUNNER.run();
      } catch (error) {
        throw new Error(`An error occurred: ${error}`);
      }
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
    throw new Error("No arguments provided. Help displayed.");
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
