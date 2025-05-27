import { Tool } from "../../src/tools/tool";
import { CompilationUnit } from "../../src/internals/ir";
import { ToolOutput } from "../../src/cli/result";

interface ContractSummaryOptions extends Record<string, unknown> {
  /**
   * Option to control output format
   */
  format?: "json" | "text";

  /**
   * Option to control verbosity
   */
  verbose?: boolean;
}

/**
 * An example external tool for Misti that prints summary on the found contracts.
 */
export class ContractSummary extends Tool<ContractSummaryOptions> {
  /**
   * Default options for this tool
   */
  get defaultOptions(): ContractSummaryOptions {
    return {
      format: "text",
      verbose: false,
    };
  }

  /**
   * Human-readable description of the tool
   */
  getDescription(): string {
    return "An example tool demonstrating how to create custom tools for Misti";
  }

  /**
   * Description of available options
   */
  getOptionDescriptions(): Record<keyof ContractSummaryOptions, string> {
    return {
      format: "Output format (json or text)",
      verbose: "Enable verbose output",
    };
  }

  /**
   * Tool implementation that runs without a compilation unit
   * Use this if your tool doesn't need to analyze code
   */
  runStandalone(): ToolOutput {
    return this.makeOutput(
      undefined,
      this.formatOutput({
        name: "Example Tool",
        timestamp: new Date().toISOString(),
        message: "Example tool executed successfully",
        options: this.options,
      }),
    );
  }

  /**
   * Tool implementation that runs with a compilation unit
   * This gets called when you provide a Tact file or project
   */
  protected runWithCU(cu: CompilationUnit): ToolOutput {
    const functionCount = cu.functions.size;
    const contractNames = Array.from(cu.getContracts().keys());
    const result = {
      projectName: cu.projectName,
      timestamp: new Date().toISOString(),
      functions: {
        count: functionCount,
        names: Array.from(cu.functions.keys()),
      },
      contracts: {
        count: contractNames.length,
        names: contractNames,
      },
      options: this.options,
    };

    if (this.options.verbose) {
      this.ctx.logger.debug(
        `Analyzed ${functionCount} functions in ${contractNames.length} contracts`,
      );
    }

    return this.makeOutput(cu, this.formatOutput(result));
  }

  /**
   * Helper to format output based on the format option
   */
  private formatOutput(data: any): string {
    if (this.options.format === "json") {
      return JSON.stringify(data, null, 2);
    } else {
      // Simple text formatter example
      return Object.entries(data)
        .map(([key, value]) => {
          if (typeof value === "object" && value !== null) {
            return `${key}:\n  ${Object.entries(value)
              .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
              .join("\n  ")}`;
          }
          return `${key}: ${JSON.stringify(value)}`;
        })
        .join("\n");
    }
  }
}
