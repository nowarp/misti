import { Driver } from "./driver";
import { cliOptions, STDOUT_PATH } from "./options";
import { OutputFormat } from "../cli";
import { BuiltInDetectors } from "../detectors/detector";
import { unreachable } from "../internals/util";
import { generateToolsHelpMessage } from "../tools/tool";
import { MISTI_VERSION, TACT_VERSION } from "../version";
import {
  Result,
  resultToString,
  saveResultToFiles,
  ResultReport,
} from "./result";
import { Logger } from "../internals/logger";
import { createNodeFileSystem } from "../vfs/createNodeFileSystem";
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
    .arguments("[paths...]");
  cliOptions.forEach((option) => command.addOption(option));
  command.action(async (_tactPath, options) => {
    const logger = new Logger();
    if (options.listTools) {
      const toolsHelpMessage = await generateToolsHelpMessage();
      logger.info(toolsHelpMessage);
      process.exit(0);
    }
    if (options.listDetectors) {
      const detectorNames = Object.keys(BuiltInDetectors);
      detectorNames.forEach((name) => logger.info(`- ${name}`));
      process.exit(0);
    }
  });
  return command;
}

/**
 * Runs the Misti CLI command with the provided arguments.
 *
 * Note: This function throws internal exceptions. Handle exceptions
 * appropriately when calling this function.
 *
 * @param args The list of arguments to pass to the CLI command.
 * @param command Optional pre-configured Command instance. Defaults to createMistiCommand().
 * @returns The created Driver instance and the result of execution.
 */
export async function runMistiCommand(
  args: string[],
  command: Command = createMistiCommand(),
): Promise<[Driver, Result]> {
  await command.parseAsync(args, { from: "user" });
  const driver = await Driver.create(command.args, {
    ...command.opts(),
    fs: createNodeFileSystem(process.cwd()),
  });
  const result = await driver.execute();
  return [driver, result];
}

/**
 * Executes Misti capturing the output and returning it as a string.
 * @param args The list of arguments to pass to the CLI command.
 * @returns The output of the Misti command as a string.
 */
export async function executeMisti(args: string[]): Promise<string> {
  const [driver, mistiResult] = await runMistiCommand(args);
  return mistiResult
    ? resultToString(mistiResult, driver.outputFormat, driver.colorizeOutput)
    : "";
}

/**
 * Handles Misti execution result by either logging to console or saving to file.
 */
export function handleMistiResult(driver: Driver, result: Result): void {
  const logger = driver.ctx.logger;
  driver.outputPath && driver.outputPath !== STDOUT_PATH
    ? handleOutputToFile(
        result,
        driver.outputPath,
        driver.outputFormat,
        driver.colorizeOutput,
        logger,
      )
    : handleOutputToConsole(
        result,
        driver.outputFormat,
        driver.outputPath,
        logger,
        driver.colorizeOutput,
      );
}

/**
 * Handles saving the result to a file and logging the outcome.
 */
function handleOutputToFile(
  result: Result,
  outputPath: string,
  outputFormat: OutputFormat,
  colorizeOutput: boolean,
  logger: Logger,
): void {
  const report: ResultReport = saveResultToFiles(
    result,
    outputPath,
    outputFormat,
    colorizeOutput,
  );
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
  result: Result,
  outputFormat: OutputFormat,
  outputFile: string,
  logger: Logger,
  colorizeOutput: boolean,
): void {
  const text = resultToString(result, outputFormat, colorizeOutput);
  const print = outputFormat === "json";
  switch (result.kind) {
    case "warnings":
      print ? console.warn(text) : logger.warn(text);
      break;
    case "error":
      print ? console.error(text) : logger.error(text);
      break;
    case "tool":
    case "ok":
      print ? console.log(text) : logger.error(text);
      break;
    default:
      unreachable(result);
  }
}
