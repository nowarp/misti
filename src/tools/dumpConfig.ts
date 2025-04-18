import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import JSONbig from "json-bigint";

type DumpConfigOptions = Record<string, unknown>;

/**
 * A tool that dumps the Misti configuration file in use.
 */
export class DumpConfig extends Tool<DumpConfigOptions> {
  get defaultOptions(): DumpConfigOptions {
    return {} as DumpConfigOptions;
  }

  runStandalone(): ToolOutput | never {
    return this.makeOutput(undefined, JSONbig.stringify(this.ctx.config));
  }

  getDescription(): string {
    return "Dumps the Misti configuration file currently in use";
  }

  getOptionDescriptions(): Record<string, string> {
    return {};
  }
}
