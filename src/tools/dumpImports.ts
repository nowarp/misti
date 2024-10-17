import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { CompilationUnit, ImportGraph } from "../internals/ir";
import { unreachable } from "../internals/util";
import JSONbig from "json-bigint";

interface DumpImportGraphOptions extends Record<string, unknown> {
  format: "dot" | "json" | "mmd";
  dumpStdlib: boolean;
}

/**
 * A tool that dumps the import graph of the given compilation unit.
 */
export class DumpImports extends Tool<DumpImportGraphOptions> {
  get defaultOptions(): DumpImportGraphOptions {
    return {
      format: "json",
      dumpStdlib: false,
    };
  }

  run(cu: CompilationUnit): ToolOutput | never {
    switch (this.options.format) {
      case "dot":
        return this.makeOutput(
          cu,
          GraphvizDumper.dumpImportGraph(cu.imports, this.options.dumpStdlib),
        );
      case "mmd":
        return this.makeOutput(
          cu,
          MermaidDumper.dumpImportGraph(cu.imports, this.options.dumpStdlib),
        );
      case "json":
        return this.makeOutput(
          cu,
          JSONDumper.dumpImportGraph(cu.imports, this.options.dumpStdlib),
        );
      default:
        throw unreachable(this.options.format);
    }
  }

  getDescription(): string {
    return "Dumps the Import Graph";
  }

  getOptionDescriptions(): Record<keyof DumpImportGraphOptions, string> {
    return {
      format: "The output format for the import graph dump: <dot|json|mmd>",
      dumpStdlib: "Whether to include standard library imports in the dump",
    };
  }
}

/**
 * Class responsible for generating a Mermaid diagram representation of an ImportGraph.
 */
class MermaidDumper {
  /**
   * Generates a Mermaid diagram format string for a given ImportGraph.
   * @param ig The import graph to be dumped.
   * @param dumpStdlib If true, the standard library imports will be included in the dump.
   * @returns The Mermaid diagram representation of the import graph.
   */
  public static dumpImportGraph(ig: ImportGraph, dumpStdlib: boolean): string {
    let diagram = "graph TD\n";
    // Generate nodes
    ig.nodes.forEach((node) => {
      // Optionally exclude stdlib nodes
      if (!dumpStdlib && node.importPath.startsWith("stdlib")) {
        return;
      }
      const nodeId = `node_${node.idx}`;
      const label = node.importPath;
      const style = node.hasContract ? ":::contractNode" : "";
      diagram += `    ${nodeId}[${label}]${style}\n`;
    });
    // Generate edges
    ig.edges.forEach((edge) => {
      const srcNode = ig.nodes.find((n) => n.idx === edge.src);
      const dstNode = ig.nodes.find((n) => n.idx === edge.dst);
      if (!srcNode || !dstNode) {
        return;
      }
      // Optionally exclude stdlib nodes
      if (
        (!dumpStdlib && srcNode.importPath.startsWith("stdlib")) ||
        (!dumpStdlib && dstNode.importPath.startsWith("stdlib"))
      ) {
        return;
      }
      const srcId = `node_${srcNode.idx}`;
      const dstId = `node_${dstNode.idx}`;
      diagram += `    ${srcId} --> ${dstId}\n`;
    });
    // Define styles for nodes with contracts
    diagram +=
      "    classDef contractNode fill:#66A7DB,stroke:#333,stroke-width:2px;\n";
    return diagram;
  }
}

/**
 * Class responsible for generating a Graphviz dot representation of an ImportGraph.
 *
 * The graphviz representation uses the following styles:
 * * Nodes with contracts are filled with a specific color.
 */
class GraphvizDumper {
  /**
   * Generates a Graphviz dot format string for a given ImportGraph.
   * @param ig The import graph to be dumped.
   * @param dumpStdlib If true, the standard library imports will be included in the dump.
   * @returns The Graphviz dot representation of the import graph.
   */
  public static dumpImportGraph(ig: ImportGraph, dumpStdlib: boolean): string {
    let graph = `digraph "ImportGraph" {\n`;
    graph += `    node [shape=box];\n`;
    // Generate nodes
    ig.nodes.forEach((node) => {
      // Optionally exclude stdlib nodes
      if (!dumpStdlib && node.importPath.startsWith("stdlib")) {
        return;
      }
      const nodeId = `node_${node.idx}`;
      const label = node.importPath;
      let style = "";
      if (node.hasContract) {
        style += ',style=filled,fillcolor="#66A7DB"';
      }
      graph += `    ${nodeId} [label="${label}"${style}];\n`;
    });
    // Generate edges
    ig.edges.forEach((edge) => {
      const srcNode = ig.nodes.find((n) => n.idx === edge.src);
      const dstNode = ig.nodes.find((n) => n.idx === edge.dst);
      if (!srcNode || !dstNode) {
        return;
      }
      // Optionally exclude stdlib nodes
      if (
        (!dumpStdlib && srcNode.importPath.startsWith("stdlib")) ||
        (!dumpStdlib && dstNode.importPath.startsWith("stdlib"))
      ) {
        return;
      }
      const srcId = `node_${srcNode.idx}`;
      const dstId = `node_${dstNode.idx}`;
      graph += `    ${srcId} -> ${dstId};\n`;
    });
    graph += `}\n`;
    return graph;
  }
}

/**
 * Class responsible for generating a JSON representation of an ImportGraph.
 */
class JSONDumper {
  /**
   * Generates a JSON format string for a given ImportGraph.
   * @param ig The import graph to be dumped.
   * @param dumpStdlib If true, the standard library imports will be included in the dump.
   * @returns The JSON representation of the import graph.
   */
  public static dumpImportGraph(ig: ImportGraph, dumpStdlib: boolean): string {
    const nodes = ig.nodes
      .filter((node) => dumpStdlib || !node.importPath.startsWith("stdlib"))
      .map((node) => ({
        idx: node.idx,
        importPath: node.importPath,
        language: node.language,
        loc: node.loc,
        hasContract: node.hasContract,
        inEdges: Array.from(node.inEdges),
        outEdges: Array.from(node.outEdges),
      }));

    const edges = ig.edges
      .filter((edge) => {
        const srcNode = ig.nodes.find((n) => n.idx === edge.src);
        const dstNode = ig.nodes.find((n) => n.idx === edge.dst);
        return (
          srcNode &&
          dstNode &&
          (dumpStdlib ||
            (!srcNode.importPath.startsWith("stdlib") &&
              !dstNode.importPath.startsWith("stdlib")))
        );
      })
      .map((edge) => ({
        idx: edge.idx,
        src: edge.src,
        dst: edge.dst,
      }));

    const data = {
      nodes,
      edges,
    };
    return JSONbig.stringify(data, null, 2);
  }
}
