import { CompilationUnit, CFG, Node } from "./ir";
import { InternalException } from "./exceptions";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";
import { AstStatement } from "@tact-lang/compiler/dist/grammar/ast";
import JSONbig from "json-bigint";

/**
 * Class responsible for generating a Graphviz dot representation of a CompilationUnit.
 *
 * The graphviz representation uses the following colors:
 * * `lightgrey`: standard library functions
 */
export class GraphvizDumper {
  /**
   * Generates a Graphviz dot format string for a given CompilationUnit.
   * @param cu The compilation unit to be dumped.
   * @param dumpStdlib If true, the standard library definitions will be included in the dump.
   * @returns The Graphviz dot representation of the compilation unit.
   */
  public static dumpCU(cu: CompilationUnit, dumpStdlib: boolean): string {
    let graph = `digraph "${cu.projectName}" {\n`;
    graph += "    node [shape=box];\n";
    cu.functions.forEach((cfg) => {
      if (!dumpStdlib && cfg.origin == "stdlib") {
        return;
      }
      graph += this.dumpCFG(cu, cfg, cfg.name);
    });
    cu.contracts.forEach((contract) => {
      contract.methods.forEach((cfg) => {
        if (!dumpStdlib && cfg.origin == "stdlib") {
          return;
        }
        graph += this.dumpCFG(cu, cfg, `${contract.name}__${cfg.name}`);
      });
    });
    graph += this.connectFunctionCalls(cu);
    graph += "}\n";
    return graph;
  }

  /**
   * Creates edges between function and method calls within the CFG.
   * @param cu The CompilationUnit containing all CFGs of the project.
   * @returns The Graphviz dot representation of the created edges.
   */
  private static connectFunctionCalls(cu: CompilationUnit): string {
    let output = "";
    cu.forEachCFG(cu.ast, (cfg: CFG, node: Node, _: AstStatement) => {
      if (node.kind.kind === "call") {
        node.kind.callees.forEach((calleeIdx) => {
          if (cfg.getNode(calleeIdx)) {
            output += `"${node.idx}" -> "${calleeIdx}";\n`;
          }
        });
      }
    });
    return output;
  }

  /**
   * Generates a Graphviz dot format string for a given CFG, wrapped in a cluster.
   * @param cfg The CFG to be dumped.
   * @param prefix A prefix to uniquely identify nodes across multiple CFGs.
   * @returns The Graphviz dot representation of the CFG.
   */
  private static dumpCFG(
    cu: CompilationUnit,
    cfg: CFG,
    prefix: string,
  ): string {
    let output = `    subgraph "cluster_${prefix}" {\n`;
    output += `        label="${prefix}";\n`;
    if (cfg.origin == "stdlib") {
      output += `        style=filled;\n`;
      output += `        color=lightgrey;\n`;
    }
    cfg.forEachNode(cu.ast, (stmt, node) => {
      const color = node.isExit() ? ',style=filled,fillcolor="#66A7DB"' : "";
      output += `        "${prefix}_${node.idx}" [label="${this.ppSummary(stmt)}"${color}];\n`;
    });
    cfg.forEachEdge((edge) => {
      output += `        "${prefix}_${edge.src}" -> "${prefix}_${edge.dst}";\n`;
    });
    output += "    }\n";
    return output;
  }

  /**
   * Formats a summary of some statements defined within nodes in order to get more concise graphical representation.
   */
  private static ppSummary(stmt: AstStatement): string {
    const removeTrailingSemicolon = (str: string): string =>
      str.replace(/;$/, "");
    const escapeDoubleQuotes = (str: string): string =>
      str.replace(/"/g, '\\"');
    const result = (() => {
      switch (stmt.kind) {
        case "statement_let":
        case "statement_return":
        case "statement_expression":
        case "statement_assign":
        case "statement_augmentedassign":
          return prettyPrint(stmt);
        case "statement_condition":
          return `if (${prettyPrint(stmt.condition)})`;
        case "statement_while":
          return `while (${prettyPrint(stmt.condition)})`;
        case "statement_until":
          return `until (${prettyPrint(stmt.condition)})`;
        case "statement_repeat":
          return `repeat (${prettyPrint(stmt.iterations)})`;
        case "statement_try":
          return "try";
        case "statement_try_catch":
          return `try ... catch (${prettyPrint(stmt.catchName)})`;
        case "statement_foreach":
          return `foreach ((${prettyPrint(stmt.keyName)}, ${prettyPrint(stmt.valueName)}) of ${prettyPrint(stmt.map)})`;
        default:
          throw InternalException.make("Unsupported statement", { node: stmt });
      }
    })();
    return escapeDoubleQuotes(removeTrailingSemicolon(result));
  }
}

/**
 * Class responsible for generating a JSON representation of a CompilationUnit.
 */
export class JSONDumper {
  /**
   * Generates a JSON format string for a given CompilationUnit.
   * @param cu The compilation unit to be dumped.
   * @param dumpStdlib If true, the standard library definitions will be included in the dump.
   * @returns The JSON representation of the compilation unit.
   */
  public static dumpCU(cu: CompilationUnit, dumpStdlib: boolean): string {
    const data = {
      projectName: cu.projectName,
      functions: Array.from(cu.functions.entries()).reduce<
        { name: string; cfg: object }[]
      >((acc, [_, cfg]) => {
        if (!dumpStdlib && cfg.origin == "stdlib") {
          return acc;
        }
        acc.push({
          name: cfg.name,
          cfg: this.dumpCFG(cfg),
        });
        return acc;
      }, []),
      contracts: Array.from(cu.contracts).map(([_idx, contract]) => ({
        name: contract.name,
        methods: Array.from(contract.methods.entries()).reduce<
          { name: string; cfg: object }[]
        >((acc, [_, cfg]) => {
          if (!dumpStdlib && cfg.origin == "stdlib") {
            return acc;
          }
          acc.push({
            name: `${contract.name}.${cfg.name}`,
            cfg: this.dumpCFG(cfg),
          });
          return acc;
        }, []),
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
