import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { CompilationUnit } from "../internals/ir";
import { unreachable } from "../internals/util";
import JSONbig from "json-bigint";

interface DumpAstOptions extends Record<string, unknown> {
  format: "json";
  dumpStdlib: boolean;
}

/**
 * A tool that dumps the AST of the given compilation unit.
 */
export class DumpAst extends Tool<DumpAstOptions> {
  get defaultOptions(): DumpAstOptions {
    return {
      format: "json",
      dumpStdlib: false,
    };
  }

  runWithCU(cu: CompilationUnit): ToolOutput | never {
    switch (this.options.format) {
      case "json":
        return this.makeOutput(cu, this.dumpJSON(cu));
      default:
        throw unreachable(this.options.format);
    }
  }

  private dumpJSON(cu: CompilationUnit): string {
    return JSONbig.stringify(
      cu.ast.getProgramEntries({ includeStdlib: this.options.dumpStdlib }),
      null,
      2,
    );
  }

  getDescription(): string {
    return "Dumps the Abstract Syntax Tree (AST)";
  }

  getOptionDescriptions(): Record<keyof DumpAstOptions, string> {
    return {
      format: "The output format for the AST dump: <json>",
      dumpStdlib:
        "Whether to include standard library definitions in the dump.",
    };
  }
}
