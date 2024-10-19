import { IdxGenerator } from "./indices";
import { SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";
import { ItemOrigin } from "@tact-lang/compiler/dist/grammar/grammar";

export type ImportNodeIdx = number;
export type ImportEdgeIdx = number;
export type ImportLanguage = "tact" | "func";
export type ImportDirection = "forward" | "backward";

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
   * Iterates over all nodes in the graph and calls the provided callback for each nodes.
   * @param callback A function to be called for each nodes in the graph.
   */
  public forEachNode(callback: (node: ImportNode) => void): void {
    this.nodes.forEach(callback);
  }

  /**
   * Iterates over all edges in the graph and calls the provided callback for each edge.
   * @param callback A function to be called for each edge in the graph.
   */
  public forEachEdge(callback: (edge: ImportEdge) => void): void {
    this.edges.forEach(callback);
  }

  /**
   * Returns true if `parent` imports `child`, directly or indirectly.
   */
  public imports(parent: ImportNodeIdx, child: ImportNodeIdx): boolean {
    let found = false;
    this.bfs(parent, (node, _) => {
      if (node.idx === child) {
        found = true;
      }
    });
    return found;
  }

  /**
   * Returns a list of nodes that have a contract definition.
   * These nodes could be entry points of the project.
   */
  public getContractNodes(): ImportNode[] {
    return Array.from(this.nodes.values()).filter((node) => node.hasContract);
  }

  /**
   * Performs a BFS on the import graph.
   * @param start The starting node index for the BFS.
   * @param callback A function called for each visited node and the edge through which it was reached.
   */
  public bfs(
    start: ImportNodeIdx,
    callback: (node: ImportNode, edge: ImportEdge | null) => void,
    { direction = "forward" }: Partial<{ direction: ImportDirection }> = {},
  ): void {
    const queue: [ImportNodeIdx, ImportEdge | null][] = [[start, null]];
    const visited = new Set<ImportNodeIdx>();
    while (queue.length > 0) {
      const [currentIdx, incomingEdge] = queue.shift()!;
      if (visited.has(currentIdx)) continue;
      const currentNode = this.nodes[this.nodesMap.get(currentIdx)!];
      visited.add(currentIdx);
      callback(currentNode, incomingEdge);
      const edges =
        direction === "backward" ? currentNode.inEdges : currentNode.outEdges;
      edges.forEach((edgeIdx) => {
        const edge = this.edges[this.edgesMap.get(edgeIdx)!];
        const nextNodeIdx = direction === "backward" ? edge.src : edge.dst;
        if (!visited.has(nextNodeIdx)) {
          queue.push([nextNodeIdx, edge]);
        }
      });
    }
  }

  /**
   * Finds a node in the graph by its import path.
   * @param importPath The absolute path of the file to find.
   * @returns The ImportNode if found, or undefined if not found.
   */
  public findNodeByPath(importPath: string): ImportNode | undefined {
    return this.nodes.find((node) => node.importPath === importPath);
  }

  /**
   * Generic method to get all connections in a specified direction.
   * @param nodeIdx The index of the node to start from.
   * @param direction The direction of traversal ('forward' or 'backward').
   * @returns An array of ImportNodes connected to the given node in the specified direction.
   */
  private getConnectionsInDirection(
    nodeIdx: ImportNodeIdx,
    direction: ImportDirection,
  ): ImportNode[] {
    const result: ImportNode[] = [];
    this.bfs(
      nodeIdx,
      (node, edge) => {
        // Skip the starting node
        if (edge !== null) result.push(node);
      },
      { direction },
    );
    return result;
  }

  /**
   * Returns all direct and indirect import connections for the given node index.
   * @param nodeIdx The index of the node to start from.
   * @returns An array of ImportNodes that are directly or indirectly imported by the given node.
   */
  public getAllImportConnections(nodeIdx: ImportNodeIdx): ImportNode[] {
    return this.getConnectionsInDirection(nodeIdx, "forward");
  }

  /**
   * Returns all nodes that directly or indirectly import the given node.
   * @param nodeIdx The index of the node to start from.
   * @returns An array of ImportNodes that directly or indirectly import the given node.
   */
  public getAllImportingNodes(nodeIdx: ImportNodeIdx): ImportNode[] {
    return this.getConnectionsInDirection(nodeIdx, "backward");
  }

  /**
   * Finds a direct connection (edge) between two nodes.
   * @param sourceIdx The index of the source node.
   * @param targetIdx The index of the target node.
   * @returns The ImportEdge if a direct connection exists, or undefined if not found.
   */
  public findConnection(
    sourceIdx: ImportNodeIdx,
    targetIdx: ImportNodeIdx,
  ): ImportEdge | undefined {
    const sourceNode = this.nodes[this.nodesMap.get(sourceIdx)!];
    return Array.from(sourceNode.outEdges)
      .map((edgeIdx) => this.edges[this.edgesMap.get(edgeIdx)!])
      .find((edge) => edge.dst === targetIdx);
  }
}
