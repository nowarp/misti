/**
 * Contains definitions of the Control Flow Graph (CFG) for Tact and utility
 * functions to work with it.
 *
 * @packageDocumentation
 */
import { TactASTStore } from "./astStore";
import { IdxGenerator } from "./indices";
import {
  BasicBlockIdx,
  CFGIdx,
  EdgeIdx,
  FunctionName,
} from "./types";
import { InternalException } from "../exceptions";
import { AstStatement, SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";

export type EntryOrigin = "user" | "stdlib";

/**
 * Represents an edge in a Control Flow Graph (CFG), connecting two nodes.
 * Each edge signifies a potential flow of control from one statement to another.
 *
 * @param src The index of the source node from which the control flow originates.
 * @param dst The index of the destination node to which the control flow goes.
 */
export class Edge {
  public idx: EdgeIdx;
  constructor(
    public src: BasicBlockIdx,
    public dst: BasicBlockIdx,
  ) {
    this.idx = IdxGenerator.next();
  }
}

/**
 * Represents the kinds of basic blocks that can be present in a control flow graph (CFG).
 */
export type BasicBlockKind =
  /**
   * Represents a regular control flow node with no special control behavior.
   */
  | { kind: "regular" }
  /**
   * Represents a node that contains function calls in its expressions.
   * `callees` refers to unique indices of the callee within the CFG.
   * Functions which definitions are not available in the current
   * compilation unit are omitted.
   */
  | { kind: "call"; callees: Set<CFGIdx> }
  /**
   * Represents an exit node that effectively terminates the execution of the current control flow.
   */
  | { kind: "exit" };

/**
 * Represents a basic block in a Control Flow Graph (CFG), corresponding to a single
 * statement in the source code.
 * Basic blocks are connected by edges that represent the flow of control between statements.
 *
 * @param stmtID The unique identifier of the statement this node represents.
 * @param kind Kind of the basic block representing ways it behave.
 * @param srcEdges A set of indices for edges incoming to this node, representing control flows leading into this statement.
 * @param dstEdges A set of indices for edges outgoing from this node, representing potential control flows out of this statement.
 */
export class BasicBlock {
  public idx: BasicBlockIdx;
  constructor(
    public stmtID: number,
    public kind: BasicBlockKind,
    public srcEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
    public dstEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
  ) {
    this.idx = IdxGenerator.next();
  }

  /**
   * Returns true iff this basic block terminates control flow.
   */
  public isExit(): boolean {
    return this.kind.kind === "exit";
  }
}

/**
 * Kind of a function that appear in CFG.
 */
export type FunctionKind = "function" | "method" | "receive";

/**
 * Describes the intraprocedural control flow graph (CFG) that corresponds to a function or method within the project.
 */
export class CFG {
  /**
   * The unique identifier of this CFG among the compilation unit it belongs to.
   */
  public idx: CFGIdx;

  /**
   * Map from unique node indices to nodes indices in the `this.nodes`.
   */
  private nodesMap: Map<BasicBlockIdx, number>;

  /**
   * Map from unique node indices to nodes indices in the `this.edges`.
   */
  private edgesMap: Map<BasicBlockIdx, number>;

  /**
   * Creates an instance of CFG.
   * @param name The name of the function or method this CFG represents.
   * @param id AST ID.
   * @param kind Indicates whether this CFG represents a standalone function or a method or a receive method belonging to a contract.
   * @param origin Indicates whether the function was defined in users code or in standard library.
   * @param nodes Map of node indices to nodes in the CFG that come in the reverse order.
   * @param edges Map of edge indices to edges in the CFG that come in the reverse order.
   * @param ref AST reference that corresponds to the function definition.
   * @param idx An optional unique index. If not set, a new one will be chosen automatically.
   */
  constructor(
    public name: FunctionName,
    public id: number,
    public kind: FunctionKind,
    public origin: EntryOrigin,
    public nodes: BasicBlock[],
    public edges: Edge[],
    public ref: SrcInfo,
    idx: CFGIdx | undefined = undefined,
  ) {
    this.idx = idx ? idx : IdxGenerator.next();
    this.nodesMap = new Map();
    this.initializeMapping(this.nodesMap, nodes);
    this.edgesMap = new Map();
    this.initializeMapping(this.edgesMap, edges);
  }

  private initializeMapping(
    mapping: Map<BasicBlockIdx | EdgeIdx, number>,
    entries: BasicBlock[] | Edge[],
  ): void {
    entries.forEach((entry, arrayIdx) => {
      mapping.set(entry.idx, arrayIdx);
    });
  }

  /**
   * Retrieves a basic block from the CFG based on its unique index.
   * @param idx The index of the node to retrieve.
   * @returns The basic block if found, otherwise undefined.
   */
  public getBasicBlock(idx: BasicBlockIdx): BasicBlock | undefined {
    const nodesIdx = this.nodesMap.get(idx);
    if (nodesIdx === undefined) {
      return undefined;
    }
    return this.nodes[nodesIdx];
  }

  /**
   * Retrieves an Edge from the CFG based on its unique index.
   * @param idx The index of the edge to retrieve.
   * @returns The Edge if found, otherwise undefined.
   */
  public getEdge(idx: EdgeIdx): Edge | undefined {
    const edgesIdx = this.edgesMap.get(idx);
    if (edgesIdx === undefined) {
      return undefined;
    }
    return this.edges[edgesIdx];
  }

  private traverseBasicBlocks(
    edgeIdxs: Set<EdgeIdx>,
    isSrc: boolean,
  ): BasicBlock[] | undefined {
    return Array.from(edgeIdxs).reduce(
      (acc, srcIdx: BasicBlockIdx) => {
        if (acc === undefined) {
          return undefined;
        }
        const edge = this.getEdge(srcIdx);
        if (edge === undefined) {
          return undefined;
        }
        const targetBB = this.getBasicBlock(isSrc ? edge.src : edge.dst);
        if (targetBB === undefined) {
          return undefined;
        }
        acc.push(targetBB);
        return acc;
      },
      [] as BasicBlock[] | undefined,
    );
  }

  /**
   * Returns successors for the given node.
   * @returns A list of predecessor nodes or `undefined` if any of the node indexes cannot be found in this CFG.
   */
  public getSuccessors(nodeIdx: BasicBlockIdx): BasicBlock[] | undefined {
    const node = this.getBasicBlock(nodeIdx);
    if (node === undefined) {
      return undefined;
    }
    return this.traverseBasicBlocks(node.dstEdges, false);
  }

  /**
   * Returns predecessors for the given node.
   * @returns A list of predecessor nodes or `undefined` if any of the node indexes cannot be found in this CFG.
   */
  public getPredecessors(nodeIdx: BasicBlockIdx): BasicBlock[] | undefined {
    const node = this.getBasicBlock(nodeIdx);
    if (node === undefined) {
      return undefined;
    }
    return this.traverseBasicBlocks(node.srcEdges, true);
  }

  /**
   * Iterates over all basic blocks in a CFG, applying a callback to each node.
   * The callback can perform any operation, such as analyzing or transforming the node.
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each node.
   */
  public forEachBasicBlock(
    astStore: TactASTStore,
    callback: (stmt: AstStatement, cfgBB: BasicBlock) => void,
  ) {
    this.nodes.forEach((cfgBB) => {
      const astNode = astStore.getStatement(cfgBB.stmtID);
      if (astNode) {
        callback(astNode, cfgBB);
      } else {
        throw InternalException.make(
          `Cannot find a statement: #${cfgBB.stmtID}`,
        );
      }
    });
  }

  /**
   * Iterates over all edges in a CFG, applying a callback to each edge.
   * @param callback The function to apply to each edge.
   */
  public forEachEdge(callback: (cfgEdge: Edge) => void) {
    this.edges.forEach((cfgEdge) => {
      callback(cfgEdge);
    });
  }
}

/**
 * An utility function that extracts node's predecessors.
 */
export function getPredecessors(cfg: CFG, node: BasicBlock): BasicBlock[] {
  const predecessors = cfg.getPredecessors(node.idx);
  if (predecessors === undefined) {
    throw InternalException.make(
      `Incorrect definition in the CFG: BB #${node.idx} has an undefined predecessor`,
    );
  }
  return predecessors;
}

/**
 * An utility function that extracts node's successors.
 */
export function getSuccessors(cfg: CFG, node: BasicBlock): BasicBlock[] {
  const successors = cfg.getSuccessors(node.idx);
  if (successors === undefined) {
    throw InternalException.make(
      `Incorrect definition in the CFG: BB #${node.idx} has an undefined predecessor`,
    );
  }
  return successors;
}
