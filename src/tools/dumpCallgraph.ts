import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { MistiContext } from "../internals/context";
import { CompilationUnit } from "../internals/ir";
import {
  CallGraph,
  CGEdge,
  CGNode,
  CGNodeId,
  CGEdgeId,
} from "../internals/ir/callGraph";
import { unreachable } from "../internals/util";
import * as fs from "fs";
import JSONbig from "json-bigint";
import * as path from "path";

/**
 * Defines the options for the DumpCallGraph tool.
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

  get defaultOptions(): DumpCallGraphOptions {
    return {
      formats: ["dot", "mmd", "json"],
      outputPath: "./test/all",
    };
  }

  /**
   * Executes the DumpCallGraph tool.
   * @param cu The CompilationUnit representing the code to analyze.
   * @returns A ToolOutput containing messages about the generated files.
   */
  run(cu: CompilationUnit): ToolOutput | never {
    const callGraph = cu.callGraph;
    const outputPath = this.options.outputPath || "./test/all";
    const baseName = cu.projectName;
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

    this.options.formats.forEach((format) => {
      let outputData: string;
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
        fs.writeFileSync(fullPath, outputData, "utf-8");
        outputs.push(`${extension.toUpperCase()} file saved to ${fullPath}`);
      } catch (error) {
        outputs.push(`Failed to save ${extension} file to ${fullPath}`);
      }
    });

    const combinedOutput = outputs.join("\n");
    return this.makeOutput(cu, combinedOutput);
  }

  getDescription(): string {
    return "Dumps the Call Graph (CG) in multiple formats: DOT, Mermaid, and JSON.";
  }

  getOptionDescriptions(): Record<keyof DumpCallGraphOptions, string> {
    return {
      formats:
        "The output formats for the call graph dump: <dot|json|mmd>. Specify one or more formats.",
      outputPath:
        "The directory path where the output files will be saved. Defaults to './test/all'.",
    };
  }
}

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
      const srcNode = callGraph.getNodes().get(edge.src as CGNodeId);
      const dstNode = callGraph.getNodes().get(edge.dst as CGNodeId);
      if (!srcNode || !dstNode) {
        console.warn(`Invalid edge: ${edge.src} -> ${edge.dst}`);
        return;
      }
      const srcId = `node_${srcNode.idx}`;
      const dstId = `node_${dstNode.idx}`;
      diagram += `    ${srcId} --> ${dstId}\n`;
    });
    return diagram;
  }
}

class GraphvizDumper {
  public static dumpCallGraph(callGraph: CallGraph): string {
    if (!callGraph || callGraph.getNodes().size === 0) {
      console.warn("Empty call graph or no nodes available.");
      return 'digraph "CallGraph" {\n    node [shape=box];\n    empty [label="Empty Call Graph"];\n}\n';
    }
    let dot = `digraph "CallGraph" {\n    node [shape=box];\n`;
    callGraph.getNodes().forEach((node: CGNode) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name?.replace(/"/g, '\\"') || "Unknown";
      dot += `    ${nodeId} [label="${label}"];\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      const srcNode = callGraph.getNodes().get(edge.src as CGNodeId);
      const dstNode = callGraph.getNodes().get(edge.dst as CGNodeId);
      if (srcNode && dstNode) {
        dot += `    node_${srcNode.idx} -> node_${dstNode.idx} [label="${edge.idx}"];\n`;
      } else {
        console.warn(
          `Skipping edge due to missing nodes: ${edge.src} -> ${edge.dst}`,
        );
      }
    });
    dot += `}\n`;
    return dot;
  }
}

class JSONDumper {
  public static dumpCallGraph(callGraph: CallGraph): string {
    if (!callGraph) {
      return JSONbig.stringify({ nodes: [], edges: [] }, null, 2);
    }
    const nodes = Array.from(callGraph.getNodes().values())
      .filter((node: CGNode) => node && typeof node.idx !== "undefined")
      .map((node: CGNode) => ({
        idx: node.idx as CGNodeId,
        name: node.name || "Unknown",
        inEdges: Array.from(node.inEdges || []),
        outEdges: Array.from(node.outEdges || []),
      }));
    const edges = Array.from(callGraph.getEdges().values())
      .filter((edge: CGEdge) => {
        const isValid =
          edge &&
          typeof edge.idx !== "undefined" &&
          typeof edge.src !== "undefined" &&
          typeof edge.dst !== "undefined" &&
          callGraph.getNodes().has(edge.src as CGNodeId) &&
          callGraph.getNodes().has(edge.dst as CGNodeId);
        if (!isValid) {
          console.warn(`Skipping invalid edge: ${edge?.src} -> ${edge?.dst}`);
        }
        return isValid;
      })
      .map((edge: CGEdge) => ({
        idx: edge.idx as CGEdgeId,
        src: edge.src as CGNodeId,
        dst: edge.dst as CGNodeId,
      }));
    return JSONbig.stringify({ nodes, edges }, null, 2);
  }
}
