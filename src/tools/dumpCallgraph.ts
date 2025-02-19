import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { MistiContext } from "../internals/context";
import { CompilationUnit, AstStore } from "../internals/ir";
import {
  CallGraph,
  CGNode,
  Effect,
  StateKind,
} from "../internals/ir/callGraph";
import { unreachable } from "../internals/util";
import JSONbig from "json-bigint";

interface DumpCallGraphOptions extends Record<string, unknown> {
  format: "dot" | "json" | "mmd";
}

/**
 * Checks if the node represents any information to be shown on graphic dumps.
 */
function shouldBeShown(node: CGNode): boolean {
  return node.loc
    ? // Hide unused stdlib functions
      node.loc.origin === "user" ||
        node.outEdges.size > 0 ||
        node.inEdges.size > 0
    : true;
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
        return this.makeOutput(
          cu,
          GraphvizDumper.dumpCallGraph(cu.ast, callGraph),
        );
      case "mmd":
        return this.makeOutput(
          cu,
          MermaidDumper.dumpCallGraph(cu.ast, callGraph),
        );
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
  public static dumpCallGraph(ast: AstStore, callGraph: CallGraph): string {
    if (!callGraph || callGraph.getNodes().size === 0) {
      return 'graph TD\n    empty["Empty Call Graph"]';
    }
    let diagram = "graph TD\n";
    callGraph.getNodes().forEach((node) => {
      if (!shouldBeShown(node)) return;
      const nodeId = `node_${node.idx}`;
      const label = (node.signature(ast) || node.name || "Unknown").replace(
        /"/g,
        "'",
      );
      const effects = getEffectsTooltip(node);
      diagram += `    ${nodeId}["${label}${effects}"]\n`;
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
  public static dumpCallGraph(ast: AstStore, callGraph: CallGraph): string {
    if (!callGraph || callGraph.getNodes().size === 0) {
      return 'digraph "CallGraph" {\n    node [shape=box];\n    empty [label="Empty Call Graph"];\n}\n';
    }
    let dot = `digraph "CallGraph" {\n    node [shape=box];\n`;
    callGraph.getNodes().forEach((node) => {
      if (!shouldBeShown(node)) return;
      const nodeId = `node_${node.idx}`;
      const label = (node.signature(ast) || node.name || "Unknown").replace(
        /"/g,
        "'",
      );
      const effects = getEffectsTooltip(node);
      dot += `    ${nodeId} [label="${label}${effects}"];\n`;
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
        name: node.signature || node.name || "Unknown",
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

function getEffectsTooltip(node: CGNode): string {
  const effects = node.effects;
  if (effects === 0) return "";
  const effectsList = [];
  const getFieldsString = (status: StateKind): string =>
    Array.from(node.stateAccess.get(status)!).join(",");
  if (effects & Effect.Send) effectsList.push("Send");
  if (effects & Effect.StateRead) {
    effectsList.push(`StateRead<${getFieldsString("read")}>`);
  }
  if (effects & Effect.StateWrite) {
    effectsList.push(`StateWrite<${getFieldsString("write")}>`);
  }
  if (effects & Effect.AccessDatetime) effectsList.push("AccessDatetime");
  if (effects & Effect.PrgUse) effectsList.push("PrgUse");
  if (effects & Effect.PrgSeedInit) effectsList.push("PrgSeedInit");
  return effectsList.length > 0 ? `\n[${effectsList.join(",")}]` : "";
}
