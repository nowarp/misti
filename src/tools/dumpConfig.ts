import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { CompilationUnit } from "../internals/ir";
import JSONbig from "json-bigint";

export interface DumpConfigOptions extends Record<string, unknown> {}

/**
 * A tool that dumps the Misti configuration file in use.
 */
export class DumpConfig extends Tool<DumpConfigOptions> {
  get defaultOptions(): DumpConfigOptions {
    return {} as DumpConfigOptions;
  }

  run(_cu: CompilationUnit): ToolOutput | never {
    return this.makeOutput(JSONbig.stringify(this.ctx.config));
  }

  getDescription(): string {
    return "Dumps the Misti configuration file currently in use";
  }

  getOptionDescriptions(): Record<string, string> {
    return {};
  }
}
