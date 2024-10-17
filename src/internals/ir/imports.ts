import { IdxGenerator } from "./indices";
import { SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";
import { ItemOrigin } from "@tact-lang/compiler/dist/grammar/grammar";

export type ImportNodeIdx = number;
export type ImportEdgeIdx = number;

export type ImportLanguage = "tact" | "func";

/**
 * Represents a node in the import graph, corresponding to a file.
 */
export class ImportNode {
  public idx: ImportNodeIdx;
  constructor(
    /** Displayed name. */
    public name: string,
    /** Origin of the node. */
    public origin: ItemOrigin,
    /** Absolute path to the imported file. */
    public importPath: string,
    /** Language in which the imported file is written. */
    public language: ImportLanguage,
    /** True if this file has a contract definition. */
    public hasContract: boolean,
    public inEdges: Set<ImportEdgeIdx> = new Set(),
    public outEdges: Set<ImportEdgeIdx> = new Set(),
  ) {
    this.idx = IdxGenerator.next("import_node");
  }
}

/**
 * Represents an edge in the import graph, connecting two files.
 */
export class ImportEdge {
  public idx: ImportEdgeIdx;
  constructor(
    public src: ImportNodeIdx,
    public dst: ImportNodeIdx,
    /** Source location of the `import` statement. */
    public loc: SrcInfo,
  ) {
    this.idx = IdxGenerator.next("import_edge");
  }
}

/**
 * Represents the entire import graph of a project.
 */
export class ImportGraph {
  /** Unique node index to this.nodes index mapping */
  private nodesMap: Map<ImportNodeIdx, number>;

  /** Unique edge index to this.edges index mapping */
  private edgesMap: Map<ImportEdgeIdx, number>;

  constructor(
    public nodes: ImportNode[],
    public edges: ImportEdge[],
  ) {
    this.nodesMap = new Map();
    this.initializeMapping(this.nodesMap, nodes);
    this.edgesMap = new Map();
    this.initializeMapping(this.edgesMap, edges);
  }

  private initializeMapping(
    mapping: Map<ImportNodeIdx | ImportEdgeIdx, number>,
    entries: ImportNode[] | ImportEdge[],
  ): void {
    entries.forEach((entry, arrayIdx) => {
      mapping.set(entry.idx, arrayIdx);
    });
  }

  /**
   * Finds independent subgraphs of files not connected by `import` directives.
   */
  public getDisconnectedComponents(): ImportNode[][] {
    throw new Error("Not yet implemented");
  }

  /**
   * Returns a list of nodes that have a contract definition.
   * These nodes could be entry points of the project.
   */
  public getContractNodes(): ImportNode[] {
    throw new Error("Not yet implemented");
  }
}
