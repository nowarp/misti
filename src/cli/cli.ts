import { Runner } from "./driver";
import { cliOptions } from "./options";
import { MistiResult, resultToString } from "./result";
import { createDetector } from "../createDetector";
import { ExecutionException } from "../internals/exceptions";
import { InternalException } from "../internals/exceptions";
import { unreachable } from "../internals/util";
import { MISTI_VERSION, TACT_VERSION } from "../version";
import { Command } from "commander";

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
    .version(`Misti ${MISTI_VERSION}\nSupported Tact version: ${TACT_VERSION}`)
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
  return result ? resultToString(result) : "";
}

/**
 * Prints Misti execution result.
 */
export function report(result?: MistiResult): void {
  if (RUNNER === undefined) {
    throw InternalException.make(
      "Report function called before runner was initialized",
    );
  }
  if (result === undefined) {
    throw InternalException.make("No result");
  }
  const logger = RUNNER.getDriver().ctx.logger;
  const text = resultToString(result);
  switch (result.kind) {
    case "warnings":
      logger.warn(text);
      break;
    case "error":
      logger.error(text);
      break;
    case "tool":
    case "ok":
      logger.info(text);
      break;
    default:
      unreachable(result);
  }
}
