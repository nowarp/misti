import { Driver } from "./driver";
import { cliOptions, STDOUT_PATH } from "./options";
import { OutputFormat } from "../cli";
import { createDetector } from "../createDetector";
import { unreachable } from "../internals/util";
import { generateToolsHelpMessage } from "../tools/tool";
import { MISTI_VERSION, TACT_VERSION } from "../version";
import {
  MistiResult,
  resultToString,
  saveResultToFiles,
  ResultReport,
} from "./result";
import { Logger } from "../internals/logger";
import { Command } from "commander";

/**
 * Creates and configures the Misti CLI command.
 * @returns The configured commander Command instance.
 */
export function createMistiCommand(): Command {
  const command = new Command()
    .name("misti")
    .description("TON Static Analyzer")
    .version(`Misti ${MISTI_VERSION}\nSupported Tact version: ${TACT_VERSION}`)
    .arguments("<PATH>");
  cliOptions.forEach((option) => command.addOption(option));
  command.action(async (_tactPath, options) => {
    if (options.listTools) {
      const toolsHelpMessage = await generateToolsHelpMessage();
      // eslint-disable-next-line no-console
      console.log(toolsHelpMessage);
      process.exit(0);
    }
    if (options.newDetector) {
      createDetector(options.newDetector);
      return;
    }
  });
  return command;
}

/**
 * Runs the Misti CLI command with the provided arguments.
 * @param args The list of arguments to pass to the CLI command.
 * @returns The created Driver instance and the result of execution.
 */
export async function runMistiCommand(
  args: string[],
  command: Command = createMistiCommand(),
): Promise<[Driver, MistiResult]> {
  await command.parseAsync(args, { from: "user" });
  const driver = await Driver.create(command.args, command.opts());
  const result = await driver.execute();
  return [driver, result];
}

/**
 * Executes Misti capturing the output and returning it as a string.
 * @param args The list of arguments to pass to the CLI command.
 * @returns The output of the Misti command as a string.
 */
export async function executeMisti(args: string[]): Promise<string> {
  const result = await runMistiCommand(args);
  if (!result) return "";
  const [driver, mistiResult] = result;
  return mistiResult ? resultToString(mistiResult, driver.outputFormat) : "";
}

/**
 * Handles Misti execution result by either logging to console or saving to file.
 */
export function handleMistiResult(driver: Driver, result: MistiResult): void {
  const logger = driver.ctx.logger;
  driver.outputPath && driver.outputPath !== STDOUT_PATH
    ? handleOutputToFile(result, driver.outputPath, logger)
    : handleOutputToConsole(result, driver.outputFormat, logger);
}

/**
 * Handles saving the result to a file and logging the outcome.
 */
function handleOutputToFile(
  result: MistiResult,
  outputPath: string,
  logger: Logger,
): void {
  const report: ResultReport = saveResultToFiles(result, outputPath);
  if (report) {
    switch (report.kind) {
      case "error":
        logger.error("Misti execution error:");
        logger.error(report.message);
        break;
      case "ok":
        logger.info("No errors found");
        break;
      default:
        unreachable(report);
    }
  }
}

/**
 * Handles logging the result to the console.
 */
function handleOutputToConsole(
  result: MistiResult,
  outputFormat: OutputFormat,
  logger: Logger,
): void {
  const text = resultToString(result, outputFormat);
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
