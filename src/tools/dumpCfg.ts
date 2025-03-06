import { Tool } from "./tool";
import { ToolOutput } from "../cli/result";
import { BasicBlock, Cfg, CompilationUnit } from "../internals/ir";
import { AstStatement, prettyPrint } from "../internals/tact/imports";
import { unreachable } from "../internals/util";
import JSONbig from "json-bigint";
import path from "path";

interface DumpCfgOptions extends Record<string, unknown> {
  format: "dot" | "json" | "mmd";
  file: string | undefined; // include only entries from this file
  dumpStdlib: boolean;
}

/**
 * A tool that dumps the Cfg of the given compilation unit.
 */
export class DumpCfg extends Tool<DumpCfgOptions> {
  get defaultOptions(): DumpCfgOptions {
    return {
      format: "json",
      file: undefined,
      dumpStdlib: false,
    };
  }

  public runWithCU(cu: CompilationUnit): ToolOutput | never {
    const file = this.options.file
      ? path.resolve(this.options.file)
      : undefined;
    switch (this.options.format) {
      case "dot":
        return this.makeOutput(
          cu,
          GraphvizDumper.dumpCU(cu, this.options.dumpStdlib, file),
        );
      case "mmd":
        return this.makeOutput(
          cu,
          MermaidDumper.dumpCU(cu, this.options.dumpStdlib, file),
        );
      case "json":
        return this.makeOutput(
          cu,
          JSONDumper.dumpCU(cu, this.options.dumpStdlib, file),
        );
      default:
        throw unreachable(this.options.format);
    }
  }

  getDescription(): string {
    return "Dumps the Control Flow Graph (Cfg)";
  }

  getOptionDescriptions(): Record<keyof DumpCfgOptions, string> {
    return {
      format: "The output format for the Cfg dump: <dot|json|mmd>",
      file: "Filter to only show entries from specified file path",
      dumpStdlib: "Whether to include standard library definitions in the dump",
    };
  }
}

/**
 * Class responsible for generating a Mermaid diagram representation of a CompilationUnit.
 */
class MermaidDumper {
  /**
   * Generates a Mermaid diagram format string for a given CompilationUnit.
   * @param cu The compilation unit to be dumped.
   * @param dumpStdlib If true, the standard library definitions will be included in the dump.
   * @returns The Mermaid diagram representation of the compilation unit.
   */
  public static dumpCU(
    cu: CompilationUnit,
    dumpStdlib: boolean,
    file?: string,
  ): string {
    let diagram = `graph TD\n`;
    cu.functions.forEach((cfg) => {
      if (
        (!dumpStdlib && cfg.origin == "stdlib") ||
        (file && cfg.ref.file !== file)
      )
        return;
      diagram += this.dumpCfg(cu, cfg, cfg.name);
    });
    cu.getContractsTraits().forEach((contract) => {
      if (file && contract.loc.file !== file) return;
      contract.methods.forEach((cfg) => {
        if (!dumpStdlib && cfg.origin == "stdlib") return;
        diagram += this.dumpCfg(cu, cfg, `${contract.name}__${cfg.name}`);
      });
    });
    // Mermaid does not support global connections in the same way as Graphviz,
    // so function calls between different CFGs are not represented here.
    return diagram;
  }

  /**
   * Generates a Mermaid diagram format string for a given CFG.
   * @param cfg The CFG to be dumped.
   * @param prefix A prefix to uniquely identify nodes across multiple CFGs.
   * @returns The Mermaid diagram representation of the CFG.
   */
  private static dumpCfg(
    cu: CompilationUnit,
    cfg: Cfg,
    prefix: string,
  ): string {
    const sanitizedPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, "_");
    let output = `subgraph ${sanitizedPrefix}\n`;
    cfg.forEachBasicBlock(cu.ast, (stmt, node) => {
      const nodeId = `${sanitizedPrefix}_${node.idx}`;
      const summary = ppSummary(stmt, {
        escapeType: "specialChars",
        wrapInQuotes: true,
      });
      const style = node.isExit() ? `:::exitNode` : "";
      output += `    ${nodeId}[${summary}]${style}\n`;
    });
    cfg.forEachEdge((edge) => {
      const srcId = `${sanitizedPrefix}_${edge.src}`;
      const dstId = `${sanitizedPrefix}_${edge.dst}`;
      output += `    ${srcId} --> ${dstId}\n`;
    });
    output += `end\n`;
    return output;
  }
}

/**
 * Class responsible for generating a Graphviz dot representation of a CompilationUnit.
 *
 * The graphviz representation uses the following colors:
 * * `lightgrey`: standard library functions
 */
class GraphvizDumper {
  /**
   * Generates a Graphviz dot format string for a given CompilationUnit.
   * @param cu The compilation unit to be dumped.
   * @param dumpStdlib If true, the standard library definitions will be included in the dump.
   * @returns The Graphviz dot representation of the compilation unit.
   */
  public static dumpCU(
    cu: CompilationUnit,
    dumpStdlib: boolean,
    file?: string,
  ): string {
    let graph = `digraph "${cu.projectName}" {\n`;
    graph += "    node [shape=box];\n";
    cu.functions.forEach((cfg) => {
      if (
        (!dumpStdlib && cfg.origin == "stdlib") ||
        (file && cfg.ref.file !== file)
      ) {
        return;
      }
      graph += this.dumpCfg(cu, cfg, cfg.name);
    });
    cu.getContractsTraits().forEach((contract) => {
      if (file && contract.loc.file !== file) return;
      contract.methods.forEach((cfg) => {
        if (!dumpStdlib && cfg.origin == "stdlib") return;
        graph += this.dumpCfg(cu, cfg, `${contract.name}__${cfg.name}`);
      });
    });
    graph += this.connectFunctionCalls(cu);
    graph += "}\n";
    return graph;
  }

  /**
   * Creates edges between function and method calls within the Cfg.
   * @param cu The CompilationUnit containing all CFGs of the project.
   * @returns The Graphviz dot representation of the created edges.
   */
  private static connectFunctionCalls(cu: CompilationUnit): string {
    let output = "";
    cu.forEachBasicBlock(
      cu.ast,
      (_cfg: Cfg, bb: BasicBlock, _: AstStatement) => {
        if (bb.kind.kind === "call") {
          bb.kind.callees.forEach((calleeIdx) => {
            const cfg = cu.findCfgByIdx(calleeIdx);
            if (cfg && cfg.nodes.length > 0) {
              // TODO: We should connect with a dummy start node instead
              output += `"${bb.idx}" -> "${cfg.nodes[0].idx}";\n`;
            }
          });
        }
      },
    );
    return output;
  }

  /**
   * Generates a Graphviz dot format string for a given CFG, wrapped in a cluster.
   * @param cfg The CFG to be dumped.
   * @param prefix A prefix to uniquely identify nodes across multiple CFGs.
   * @returns The Graphviz dot representation of the CFG.
   */
  private static dumpCfg(
    cu: CompilationUnit,
    cfg: Cfg,
    prefix: string,
  ): string {
    let output = `    subgraph "cluster_${prefix}" {\n`;
    output += `        label="${prefix}";\n`;
    if (cfg.origin == "stdlib") {
      output += `        style=filled;\n`;
      output += `        color=lightgrey;\n`;
    }
    cfg.forEachBasicBlock(cu.ast, (stmt, node) => {
      const color = node.isExit() ? ',style=filled,fillcolor="#66A7DB"' : "";
      output += `        "${prefix}_${node.idx}" [label="${ppSummary(stmt, { escapeType: "doubleQuotes", wrapInQuotes: false })}"${color}];\n`;
    });
    cfg.forEachEdge((edge) => {
      output += `        "${prefix}_${edge.src}" -> "${prefix}_${edge.dst}";\n`;
    });
    output += "    }\n";
    return output;
  }
}

/**
 * Class responsible for generating a JSON representation of a CompilationUnit.
 */
class JSONDumper {
  /**
   * Generates a JSON format string for a given CompilationUnit.
   * @param cu The compilation unit to be dumped.
   * @param dumpStdlib If true, the standard library definitions will be included in the dump.
   * @returns The JSON representation of the compilation unit.
   */
  public static dumpCU(
    cu: CompilationUnit,
    dumpStdlib: boolean,
    file?: string,
  ): string {
    const data = {
      projectName: cu.projectName,
      functions: Array.from(cu.functions.entries()).reduce<
        { name: string; cfg: object }[]
      >((acc, [_, cfg]) => {
        if (
          (!dumpStdlib && cfg.origin == "stdlib") ||
          (file && cfg.ref.file !== file)
        ) {
          return acc;
        }
        acc.push({
          name: cfg.name,
          cfg: this.dumpCFG(cfg),
        });
        return acc;
      }, []),
      contracts: Array.from(cu.getContractsTraits()).map(
        ([_idx, contract]) => ({
          name: contract.name,
          methods: Array.from(contract.methods.entries()).reduce<
            { name: string; cfg: object }[]
          >((acc, [_, cfg]) => {
            if (
              (!dumpStdlib && cfg.origin == "stdlib") ||
              (file && cfg.ref.file !== file)
            ) {
              return acc;
            }
            acc.push({
              name: `${contract.name}.${cfg.name}`,
              cfg: this.dumpCFG(cfg),
            });
            return acc;
          }, []),
        }),
      ),
    };
    return JSONbig.stringify(data, null, 2);
  }

  /**
   * Generates a JSON object for a given Cfg.
   * @param cfg The Cfg to be dumped.
   * @returns The JSON object representing the Cfg.
   */
  private static dumpCFG(cfg: Cfg): object {
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

/**
 * Formats a summary of some statements defined within nodes for a more concise graphical representation.
 */
function ppSummary(
  stmt: AstStatement,
  options?: {
    escapeType?: "specialChars" | "doubleQuotes";
    wrapInQuotes?: boolean;
  },
): string {
  options = options || {};
  const escapeType = options.escapeType || "specialChars";
  const wrapInQuotes =
    options.wrapInQuotes !== undefined ? options.wrapInQuotes : true;
  const removeTrailingSemicolon = (str: string): string =>
    str.replace(/;$/, "");
  const escapeFunction =
    escapeType === "specialChars"
      ? (str: string): string =>
          str.replace(/"/g, "'").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      : (str: string): string => str.replace(/"/g, '\\"');

  const result = (() => {
    switch (stmt.kind) {
      case "statement_let":
      case "statement_return":
      case "statement_expression":
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_block":
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
        return (
          `try` +
          (stmt.catchBlock
            ? ` ... catch (${prettyPrint(stmt.catchBlock.catchName)})`
            : "")
        );
      case "statement_foreach":
        return `foreach ((${prettyPrint(stmt.keyName)}, ${prettyPrint(
          stmt.valueName,
        )}) of ${prettyPrint(stmt.map)})`;
      case "statement_destruct":
        const localIds = Array.from(stmt.identifiers.values())
          .map(([_, localId]) => prettyPrint(localId))
          .join(", ");
        return `{ ${localIds} } = ${prettyPrint(stmt.expression)}`;
      default:
        unreachable(stmt);
    }
  })();
  const processedResult = escapeFunction(removeTrailingSemicolon(result));
  return wrapInQuotes ? `"${processedResult}"` : processedResult;
}
