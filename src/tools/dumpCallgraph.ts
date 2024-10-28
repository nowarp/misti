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
  format: "dot" | "json" | "mmd";
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
      format: "json",
      outputPath: "./output",
    };
  }

  run(cu: CompilationUnit): ToolOutput | never {
    const callGraph = cu.callGraph;
    let output: string;
    switch (this.options.format) {
      case "dot":
        output = GraphvizDumper.dumpCallGraph(callGraph);
        break;
      case "mmd":
        output = MermaidDumper.dumpCallGraph(callGraph);
        break;
      case "json":
        output = JSONDumper.dumpCallGraph(callGraph);
        break;
      default:
        throw unreachable(this.options.format);
    }

    const outputPath = this.options.outputPath || ".";
    const outputFile = path.join(
      outputPath,
      `callgraph.${this.options.format}`,
    );
    fs.writeFileSync(outputFile, output, "utf8");
    return this.makeOutput(cu, output);
  }

  getDescription(): string {
    return "Dumps the Call Graph (CG) in multiple formats: DOT, Mermaid, and JSON.";
  }

  getOptionDescriptions(): Record<keyof DumpCallGraphOptions, string> {
    return {
      format: "The output format for the Callgraph dump: <dot|json|mmd>",
      outputPath: "The output directory path for the call graph file",
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
      if (!node || typeof node.idx === "undefined") return;
      const nodeId = `node_${node.idx}`;
      const label = node.name?.replace(/"/g, '\\"') || "Unknown";
      diagram += `    ${nodeId}["${label}"]\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      if (
        !edge ||
        typeof edge.src === "undefined" ||
        typeof edge.dst === "undefined"
      )
        return;
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
      return 'digraph "CallGraph" {\n    node [shape=box];\n    empty [label="Empty Call Graph"];\n}\n';
    }
    let dot = `digraph "CallGraph" {\n    node [shape=box];\n`;
    callGraph.getNodes().forEach((node: CGNode) => {
      if (!node || typeof node.idx === "undefined") return;
      const nodeId = `node_${node.idx}`;
      const label = node.name?.replace(/"/g, '\\"') || "Unknown";
      dot += `    ${nodeId} [label="${label}"];\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      if (
        !edge ||
        typeof edge.src === "undefined" ||
        typeof edge.dst === "undefined"
      )
        return;
      const srcNode = callGraph.getNodes().get(edge.src as CGNodeId);
      const dstNode = callGraph.getNodes().get(edge.dst as CGNodeId);
      if (!srcNode || !dstNode) {
        console.warn(`Invalid edge: ${edge.src} -> ${edge.dst}`);
        return;
      }
      dot += `    node_${srcNode.idx} -> node_${dstNode.idx} [label="${edge.idx}"];\n`;
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
