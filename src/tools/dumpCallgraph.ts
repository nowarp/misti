import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { CompilationUnit } from "../internals/ir";
import { CallGraph, CGEdge, CGNode } from "../internals/ir/callGraph";
import { unreachable } from "../internals/util";
import * as fs from "fs";
import JSONbig from "json-bigint";
import * as path from "path";

interface DumpCallGraphOptions extends Record<string, unknown> {
  format: "dot" | "json" | "mmd";
  outputPath?: string;
}

/**
 * A tool that dumps the Call Graph (CG) of the given compilation unit.
 */
export class DumpCallGraph extends Tool<DumpCallGraphOptions> {
  get defaultOptions(): DumpCallGraphOptions {
    throw new Error("Method not implemented.");
  }
  getDescription(): string {
    throw new Error("Method not implemented.");
  }
  getOptionDescriptions(): Record<keyof DumpCallGraphOptions, string> {
    throw new Error("Method not implemented.");
  }
  private projectName: string;
  constructor(projectName: string, ctx: any, options: DumpCallGraphOptions) {
    super(ctx, options);
    this.projectName = projectName;
  }
  static run(cu: CompilationUnit, outputFileName?: string): ToolOutput | never {
    const dumpCallGraph = new DumpCallGraph(
      cu.projectName,
      {},
      { format: "dot" },
    );
    return dumpCallGraph.run(cu, outputFileName);
  }
  run(cu: CompilationUnit, outputFileName?: string): ToolOutput | never {
    const callGraph = cu.callGraph;
    const outputPath = this.options.outputPath || ".";
    const baseName = outputFileName || this.projectName; // Use custom output file name if provided
    switch (this.options.format) {
      case "dot": {
        const dotOutput = GraphvizDumper.dumpCallGraph(callGraph);
        this.saveOutput(outputPath, `${baseName}.callgraph.dot`, dotOutput);
        return this.makeOutput(
          cu,
          `DOT file saved to ${path.join(outputPath, `${baseName}.callgraph.dot`)}`,
        );
      }
      case "mmd": {
        const mermaidOutput = MermaidDumper.dumpCallGraph(callGraph);
        this.saveOutput(outputPath, `${baseName}.callgraph.mmd`, mermaidOutput);
        return this.makeOutput(
          cu,
          `Mermaid file saved to ${path.join(outputPath, `${baseName}.callgraph.mmd`)}`,
        );
      }
      case "json": {
        const jsonOutput = JSONDumper.dumpCallGraph(callGraph);
        this.saveOutput(outputPath, `${baseName}.callgraph.json`, jsonOutput);
        return this.makeOutput(
          cu,
          `JSON file saved to ${path.join(outputPath, `${baseName}.callgraph.json`)}`,
        );
      }
      default:
        throw unreachable(this.options.format);
    }
  }
  private saveOutput(outputPath: string, fileName: string, data: string): void {
    const fullPath = path.join(outputPath, fileName);
    fs.writeFileSync(fullPath, data);
  }
}

/**
 * Class responsible for generating a Mermaid diagram representation of a CallGraph.
 */
class MermaidDumper {
  public static dumpCallGraph(callGraph: CallGraph): string {
    let diagram = "graph TD\n";
    callGraph.getNodes().forEach((node: CGNode) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name;
      diagram += `    ${nodeId}["${label}"]\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      const srcNode = callGraph.getNodes().get(edge.src);
      const dstNode = callGraph.getNodes().get(edge.dst);
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
  public static dumpCallGraph(callGraph: CallGraph): string {
    let dot = `digraph "CallGraph" {\n`;
    dot += `    node [shape=box];\n`;
    callGraph.getNodes().forEach((node: CGNode) => {
      const nodeId = `node_${node.idx}`;
      const label = node.name;
      dot += `    ${nodeId} [label="${label}"];\n`;
    });
    callGraph.getEdges().forEach((edge: CGEdge) => {
      const srcNode = callGraph.getNodes().get(edge.src);
      const dstNode = callGraph.getNodes().get(edge.dst);
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
  public static dumpCallGraph(callGraph: CallGraph): string {
    const nodes = Array.from(callGraph.getNodes().values()).map(
      (node: CGNode) => ({
        idx: node.idx,
        name: node.name,
        inEdges: Array.from(node.inEdges),
        outEdges: Array.from(node.outEdges),
      }),
    );
    const edges = Array.from(callGraph.getEdges().values()).map(
      (edge: CGEdge) => ({
        idx: edge.idx,
        src: edge.src,
        dst: edge.dst,
      }),
    );
    const data = {
      nodes,
      edges,
    };
    return JSONbig.stringify(data, null, 2);
  }
}
