import { CompilationUnit, CFG } from "./ir";

import JSONbig from "json-bigint";

/**
 * Class responsible for generating a Graphviz dot representation of a CompilationUnit.
 */
export class GraphvizDumper {
  /**
   * Generates a Graphviz dot format string for a given CompilationUnit.
   * @param cu The compilation unit to be dumped.
   * @returns The Graphviz dot representation of the compilation unit.
   */
  public static dumpCU(cu: CompilationUnit): string {
    let graph = `digraph ${cu.projectName} {\n`;
    graph += "    node [shape=box];\n";
    cu.functions.forEach((cfg, functionName) => {
      graph += this.dumpCFG(cfg, functionName);
    });
    cu.contracts.forEach((contract) => {
      contract.methods.forEach((cfg, methodName) => {
        graph += this.dumpCFG(cfg, `${contract.name}__${methodName}`);
      });
    });
    graph += "}\n";
    return graph;
  }

  /**
   * Generates a Graphviz dot format string for a given CFG, wrapped in a cluster.
   * @param cfg The CFG to be dumped.
   * @param prefix A prefix to uniquely identify nodes across multiple CFGs.
   * @returns The Graphviz dot representation of the CFG.
   */
  private static dumpCFG(cfg: CFG, prefix: string): string {
    let output = `    subgraph cluster_${prefix} {\n`;
    output += `        label="${prefix}";\n`;
    if (cfg.origin == "stdlib") {
      output += `        style=filled;\n`;
      output += `        color=lightgrey;\n`;
    }
    cfg.nodes.forEach((node) => {
      output += `        "${prefix}_${node.idx}" [label="Node ${node.idx}"];\n`;
    });
    cfg.edges.forEach((edge) => {
      output += `        "${prefix}_${edge.src}" -> "${prefix}_${edge.dst}";\n`;
    });
    output += "    }\n";
    return output;
  }
}

/**
 * Class responsible for generating a JSON representation of a CompilationUnit.
 */
export class JSONDumper {
  /**
   * Generates a JSON format string for a given CompilationUnit.
   * @param cu The compilation unit to be dumped.
   * @returns The JSON representation of the compilation unit.
   */
  public static dumpCU(cu: CompilationUnit): string {
    const data = {
      projectName: cu.projectName,
      functions: Array.from(cu.functions.entries()).map(([name, cfg]) => ({
        name,
        cfg: this.dumpCFG(cfg),
      })),
      contracts: Array.from(cu.contracts).map((contract) => ({
        name: contract.name,
        methods: Array.from(contract.methods.entries()).map(
          ([methodName, cfg]) => ({
            name: `${contract.name}.${methodName}`,
            cfg: this.dumpCFG(cfg),
          }),
        ),
      })),
    };
    return JSONbig.stringify(data, null, 2);
  }

  /**
   * Generates a JSON object for a given CFG.
   * @param cfg The CFG to be dumped.
   * @returns The JSON object representing the CFG.
   */
  private static dumpCFG(cfg: CFG): object {
    const nodes = cfg.nodes.map((node) => ({
      id: node.idx,
      stmtID: node.stmtID,
      srcEdges: Array.from(node.srcEdges),
      dstEdges: Array.from(node.dstEdges),
    }));

    const edges = cfg.edges.map((edge) => ({
      id: edge.idx,
      src: edge.src,
      dst: edge.dst,
    }));

    return {
      nodes: nodes,
      edges: edges,
    };
  }
}
