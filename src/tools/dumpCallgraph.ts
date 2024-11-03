import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { MistiContext } from "../internals/context";
import { CompilationUnit } from "../internals/ir";
import { CallGraph, CGEdge, CGNode } from "../internals/ir/callGraph";
import { unreachable } from "../internals/util";
import * as fs from "fs";
import JSONbig from "json-bigint";
import * as path from "path";

/**
 * Defines options for the `DumpCallGraph` tool.
 */
interface DumpCallGraphOptions extends Record<string, unknown> {
  formats: Array<"dot" | "json" | "mmd">;
  outputPath?: string;
}

/**
 * A tool that dumps the Call Graph (CG) of the given compilation unit in multiple formats.
 */
export class DumpCallGraph extends Tool<DumpCallGraphOptions> {
  constructor(ctx: MistiContext, options: DumpCallGraphOptions) {
    super(ctx, options);
  }

  public get defaultOptions(): DumpCallGraphOptions {
    return {
      formats: ["dot", "mmd", "json"],
      outputPath: "./test/all",
    };
  }

  /**
   * Executes `DumpCallGraph` tool.
   * @param cu `CompilationUnit` representing the code to analyze.
   * @returns A `ToolOutput` containing messages about the generated files.
   */
  public run(cu: CompilationUnit): ToolOutput | never {
    const callGraph = cu.callGraph;
    const outputPath = this.options.outputPath || "./test/all";
    const baseName = cu.projectName || "callgraph";
    const outputs: string[] = [];

    const supportedFormats = ["dot", "mmd", "json"] as const;
    type SupportedFormat = (typeof supportedFormats)[number];
    if (
      !this.options.formats.every((format) =>
        supportedFormats.includes(format as SupportedFormat),
      )
    ) {
      throw new Error(
        `Unsupported format specified. Supported formats are: ${supportedFormats.join(", ")}`,
      );
    }
    fs.mkdirSync(outputPath, { recursive: true });

    // Generate and save the call graph in each requested format
    this.options.formats.forEach((format) => {
      let outputData: string | object;
      let extension: string;

      switch (format) {
        case "dot":
          outputData = GraphvizDumper.dumpCallGraph(callGraph);
          extension = "callgraph.dot";
          break;
        case "mmd":
          outputData = MermaidDumper.dumpCallGraph(callGraph);
          extension = "callgraph.mmd";
          break;
        case "json":
          outputData = JSONDumper.dumpCallGraph(callGraph);
          extension = "callgraph.json";
          break;
        default:
          throw unreachable(format);
      }

      const fullFileName = `${baseName}.${extension}`;
      const fullPath = path.join(outputPath, fullFileName);
      try {
        if (format === "json") {
          fs.writeFileSync(
            fullPath,
            JSONbig.stringify(outputData, null, 2),
            "utf-8",
          );
        } else {
          fs.writeFileSync(fullPath, outputData as string, "utf-8");
        }
        outputs.push(`${extension.toUpperCase()} file saved to ${fullPath}`);
      } catch (error) {
        outputs.push(
          `Failed to save ${extension} file to ${fullPath}: ${error}`,
        );
      }
    });
    const combinedOutput = outputs.join("\n");
    return this.makeOutput(cu, combinedOutput);
  }

  public getDescription(): string {
    return "Dumps the Call Graph (CG) in multiple formats: DOT, Mermaid, and JSON.";
  }

  public getOptionDescriptions(): Record<keyof DumpCallGraphOptions, string> {
    return {
      formats:
        "The output formats for the call graph dump: <dot|json|mmd>. Specify one or more formats.",
      outputPath:
        "The directory path where the output files will be saved. Defaults to './test/all'.",
    };
  }
}

/**
 * Utility class to dump the call graph in Mermaid format.
 */
class MermaidDumper {
  public static dumpCallGraph(callGraph: CallGraph): string {
    if (!callGraph || callGraph.getNodes().size === 0) {
      return 'graph TD\n    empty["Empty Call Graph"]';
    }
    let diagram = "graph TD\n";
    callGraph.getNodes().forEach((node: CGNode) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name?.replace(/"/g, '\\"') || "Unknown";
      diagram += `    ${nodeId}["${label}"]\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      const srcId = `node_${edge.src}`;
      const dstId = `node_${edge.dst}`;
      diagram += `    ${srcId} --> ${dstId}\n`;
    });
    return diagram;
  }
}

/**
 * Utility class to dump the call graph in DOT (Graphviz) format.
 */
class GraphvizDumper {
  public static dumpCallGraph(callGraph: CallGraph): string {
    if (!callGraph || callGraph.getNodes().size === 0) {
      return 'digraph "CallGraph" {\n    node [shape=box];\n    empty [label="Empty Call Graph"];\n}\n';
    }
    let dot = `digraph "CallGraph" {\n    node [shape=box];\n`;
    callGraph.getNodes().forEach((node: CGNode) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name?.replace(/"/g, '\\"') || "Unknown";
      dot += `    ${nodeId} [label="${label}"];\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      const srcId = `node_${edge.src}`;
      const dstId = `node_${edge.dst}`;
      dot += `    ${srcId} -> ${dstId};\n`;
    });
    dot += `}\n`;
    return dot;
  }
}

/**
 * Utility class to dump the call graph in JSON format.
 */
class JSONDumper {
  public static dumpCallGraph(callGraph: CallGraph): object {
    if (!callGraph) {
      return { nodes: [], edges: [] };
    }
    const nodes = Array.from(callGraph.getNodes().values()).map(
      (node: CGNode) => ({
        idx: node.idx,
        name: node.name || "Unknown",
        inEdges: Array.from(node.inEdges || []),
        outEdges: Array.from(node.outEdges || []),
      }),
    );
    const edges = Array.from(callGraph.getEdges().values()).map(
      (edge: CGEdge) => ({
        idx: edge.idx,
        src: edge.src,
        dst: edge.dst,
      }),
    );
    return { nodes, edges };
  }
}
