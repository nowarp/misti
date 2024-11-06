import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { MistiContext } from "../internals/context";
import { CompilationUnit } from "../internals/ir";
import { CallGraph } from "../internals/ir/callGraph";
import { unreachable } from "../internals/util";
import JSONbig from "json-bigint";

interface DumpCallGraphOptions extends Record<string, unknown> {
  format: "dot" | "json" | "mmd";
}

/**
 * A tool that dumps the Call Graph (CG) of the given compilation unit in the specified format.
 */
export class DumpCallGraph extends Tool<DumpCallGraphOptions> {
  constructor(ctx: MistiContext, options: DumpCallGraphOptions) {
    super(ctx, options);
  }

  public get defaultOptions(): DumpCallGraphOptions {
    return {
      format: "dot",
    };
  }

  /**
   * Executes `DumpCallGraph` tool.
   * @param cu `CompilationUnit` representing the code to analyze.
   * @returns A `ToolOutput` containing the generated call graph data.
   */
  public run(cu: CompilationUnit): ToolOutput | never {
    const callGraph = cu.callGraph;
    const format = this.options.format;

    switch (format) {
      case "dot":
        return this.makeOutput(cu, GraphvizDumper.dumpCallGraph(callGraph));
      case "mmd":
        return this.makeOutput(cu, MermaidDumper.dumpCallGraph(callGraph));
      case "json":
        return this.makeOutput(cu, JSONDumper.dumpCallGraph(callGraph));
      default:
        throw unreachable(format);
    }
  }

  public getDescription(): string {
    return "Dumps the Call Graph (CG) in the selected format: DOT, Mermaid, or JSON.";
  }

  public getOptionDescriptions(): Record<keyof DumpCallGraphOptions, string> {
    return {
      format: "The output format for the call graph dump: <dot|json|mmd>.",
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
    callGraph.getNodes().forEach((node) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name?.replace(/"/g, '\\"') || "Unknown";
      diagram += `    ${nodeId}["${label}"]\n`;
    });
    callGraph.getEdges().forEach((edge) => {
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
    callGraph.getNodes().forEach((node) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name?.replace(/"/g, '\\"') || "Unknown";
      dot += `    ${nodeId} [label="${label}"];\n`;
    });
    callGraph.getEdges().forEach((edge) => {
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
  public static dumpCallGraph(callGraph: CallGraph): string {
    if (!callGraph) {
      return JSONbig.stringify({ nodes: [], edges: [] }, null, 2);
    }
    const data = {
      nodes: Array.from(callGraph.getNodes().values()).map((node) => ({
        idx: node.idx,
        name: node.name || "Unknown",
        inEdges: Array.from(node.inEdges || []),
        outEdges: Array.from(node.outEdges || []),
      })),
      edges: Array.from(callGraph.getEdges().values()).map((edge) => ({
        idx: edge.idx,
        src: edge.src,
        dst: edge.dst,
      })),
    };
    return JSONbig.stringify(data, null, 2);
  }
}
