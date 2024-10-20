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
import JSONbig from "json-bigint";

/**
 * Defines the options for the DumpCallGraph tool.
 */
interface DumpCallGraphOptions extends Record<string, unknown> {
  /**
   * The output formats for the call graph dump.
   */
  format: "dot" | "json" | "mmd";
}

/**
 * A tool that dumps the Call Graph (CG) of the given compilation unit in multiple formats.
 */
export class DumpCallGraph extends Tool<DumpCallGraphOptions> {
  /**
   * Constructs a new DumpCallGraph tool instance.
   * @param ctx The MistiContext providing necessary context.
   * @param options The options for dumping the call graph.
   */
  constructor(ctx: MistiContext, options: DumpCallGraphOptions) {
    super(ctx, options);
  }

  /**
   * Provides the default options for the DumpCallGraph tool.
   * Generates all three formats by default and saves them to "./test/all".
   */
  get defaultOptions(): DumpCallGraphOptions {
    return {
      format: "json",
    };
  }

  /**
   * Executes the DumpCallGraph tool.
   * Generates the call graph in all specified formats and writes them to the output directory.
   * @param cu The CompilationUnit representing the code to analyze.
   * @returns A ToolOutput containing messages about the generated files.
   */
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
    return this.makeOutput(cu, output);
  }

  /**
   * Provides a description of the DumpCallGraph tool.
   * @returns A string describing the tool.
   */
  getDescription(): string {
    return "Dumps the Call Graph (CG) in multiple formats: DOT, Mermaid, and JSON.";
  }

  /**
   * Provides descriptions for each option of the DumpCallGraph tool.
   * @returns A record mapping each option key to its description.
   */
  getOptionDescriptions(): Record<keyof DumpCallGraphOptions, string> {
    return {
      format: "The output format for the Callgraph dump: <dot|json|mmd>",
    };
  }
}

/**
 * Class responsible for generating a Mermaid diagram representation of a CallGraph.
 */
class MermaidDumper {
  /**
   * Generates a Mermaid diagram format string for a given CallGraph.
   * @param callGraph The CallGraph to be dumped.
   * @returns The Mermaid diagram representation of the call graph.
   */
  public static dumpCallGraph(callGraph: CallGraph): string {
    let diagram = "graph TD\n";
    callGraph.getNodes().forEach((node: CGNode) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name.replace(/"/g, '\\"');
      diagram += `    ${nodeId}["${label}"]\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      const srcNode = callGraph.getNodes().get(edge.src as CGNodeId);
      const dstNode = callGraph.getNodes().get(edge.dst as CGNodeId);
      if (!srcNode || !dstNode) return;
      const srcId = `node_${srcNode.idx}`;
      const dstId = `node_${dstNode.idx}`;
      diagram += `    ${srcId} --> ${dstId}\n`;
    });
    return diagram;
  }
}

/**
 * Class responsible for generating a Graphviz dot representation of a CallGraph.
 */
class GraphvizDumper {
  /**
   * Generates a Graphviz dot format string for a given CallGraph.
   * @param callGraph The CallGraph to be dumped.
   * @returns The Graphviz dot representation of the call graph.
   */
  public static dumpCallGraph(callGraph: CallGraph): string {
    let dot = `digraph "CallGraph" {\n`;
    dot += `    node [shape=box];\n`;
    callGraph.getNodes().forEach((node: CGNode) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name.replace(/"/g, '\\"'); // Escape double quotes
      dot += `    ${nodeId} [label="${label}"];\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      const srcNode = callGraph.getNodes().get(edge.src as CGNodeId);
      const dstNode = callGraph.getNodes().get(edge.dst as CGNodeId);
      if (srcNode && dstNode) {
        dot += `    node_${srcNode.idx} -> node_${dstNode.idx} [label="${edge.idx}"];\n`;
      } else {
        console.warn(`Missing node for edge: ${edge.src} -> ${edge.dst}`);
      }
    });
    dot += `}\n`;
    return dot;
  }
}

/**
 * Class responsible for generating a JSON representation of a CallGraph.
 */
class JSONDumper {
  /**
   * Generates a JSON format string for a given CallGraph.
   * @param callGraph The CallGraph to be dumped.
   * @returns The JSON representation of the call graph.
   */
  public static dumpCallGraph(callGraph: CallGraph): string {
    const nodes = Array.from(callGraph.getNodes().values()).map(
      (node: CGNode) => ({
        idx: node.idx as CGNodeId,
        name: node.name,
        inEdges: Array.from(node.inEdges),
        outEdges: Array.from(node.outEdges),
      }),
    );
    const edges = Array.from(callGraph.getEdges().values()).map(
      (edge: CGEdge) => ({
        idx: edge.idx as CGEdgeId,
        src: edge.src as CGNodeId,
        dst: edge.dst as CGNodeId,
      }),
    );
    const data = {
      nodes,
      edges,
    };
    return JSONbig.stringify(data, null, 2);
  }
}
