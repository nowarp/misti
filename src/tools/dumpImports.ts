import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { CompilationUnit, ImportGraph } from "../internals/ir";
import { unreachable } from "../internals/util";
import JSONbig from "json-bigint";
import path from "path";

interface DumpImportGraphOptions extends Record<string, unknown> {
  format: "dot" | "json" | "mmd";
  dumpStdlib: boolean;
}

/**
 * Colors used in visual representations.
 */
class Colors {
  public static GREEN = "#90EE90";
  public static YELLOW = "#FFFF80";
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
 *
 * The mermaid representation uses the following styles:
 * * Files containing contracts are filled with a green color
 * * Imports from stdlib are filled with a yellow color
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
      if (!dumpStdlib && node.origin === "stdlib") {
        return;
      }
      const nodeId = `node_${node.idx}`;
      const label = node.name;
      const style = node.hasContract
        ? ":::contractNode"
        : node.origin === "stdlib"
          ? ":::stdlibNode"
          : "";
      diagram += `    ${nodeId}["${label}"]${style}\n`;
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
        (!dumpStdlib && srcNode.origin === "stdlib") ||
        (!dumpStdlib && dstNode.origin === "stdlib")
      ) {
        return;
      }
      const srcId = `node_${srcNode.idx}`;
      const dstId = `node_${dstNode.idx}`;
      diagram += `    ${srcId} --> ${dstId}\n`;
    });
    // Define styles
    diagram += `    classDef contractNode fill:${Colors.GREEN},stroke:#333,stroke-width:2px;\n`;
    diagram += `    classDef stdlibNode fill:${Colors.YELLOW},stroke:#333,stroke-width:2px;\n`;
    return diagram;
  }
}

/**
 * Class responsible for generating a Graphviz dot representation of an ImportGraph.
 *
 * The graphviz representation uses the following styles:
 * * Files containing contracts are filled with a green color
 * * Imports from stdlib are filled with a yellow color
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
      if (!dumpStdlib && node.origin === "stdlib") {
        return;
      }
      const nodeId = `node_${node.idx}`;
      const label = node.name;
      let style = "";
      if (node.hasContract) {
        style += `,style=filled,fillcolor="${Colors.GREEN}"`;
      } else if (node.origin === "stdlib") {
        style += `,style=filled,fillcolor="${Colors.YELLOW}"`;
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
        (!dumpStdlib && srcNode.origin === "stdlib") ||
        (!dumpStdlib && dstNode.origin === "stdlib")
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
      .filter((node) => dumpStdlib || node.origin !== "stdlib")
      .map((node) => ({
        idx: node.idx,
        name: node.name,
        origin: node.origin,
        importPath: path.relative(process.cwd(), node.importPath),
        language: node.language,
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
            (srcNode.origin !== "stdlib" && dstNode.origin !== "stdlib"))
        );
      })
      .map((edge) => ({
        idx: edge.idx,
        src: edge.src,
        dst: edge.dst,
        loc: edge.loc,
      }));

    const data = {
      nodes,
      edges,
    };
    return JSONbig.stringify(data, null, 2);
  }
}
