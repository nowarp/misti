/**
 * Contains definitions of the Control Flow Graph (CFG) for Tact and utility
 * functions to work with it.
 *
 * @packageDocumentation
 */
import { AstStore } from "./astStore";
import { IdxGenerator } from "./indices";
import { FunctionName } from "./types";
import { InternalException } from "../exceptions";
import {
  AstNode,
  AstStatement,
  SrcInfo,
} from "@tact-lang/compiler/dist/grammar/ast";
import { ItemOrigin } from "@tact-lang/compiler/dist/grammar/grammar";

export type EdgeIdx = number & { readonly __brand: unique symbol };
export type BasicBlockIdx = number & { readonly __brand: unique symbol };
export type CfgIdx = number & { readonly __brand: unique symbol };

/**
 * Represents an edge in a Control Flow Graph (CFG), connecting two basic blocks.
 * Each edge signifies a potential flow of control from one statement to another.
 *
 * @param src The index of the source block from which the control flow originates.
 * @param dst The index of the destination block to which the control flow goes.
 */
export class Edge {
  public idx: EdgeIdx;
  constructor(
    public src: BasicBlockIdx,
    public dst: BasicBlockIdx,
  ) {
    this.idx = IdxGenerator.next("cfg_edge") as EdgeIdx;
  }
}

/**
 * Represents the kinds of basic blocks that can be present in a CFG.
 */
export type BasicBlockKind =
  /**
   * Represents a regular control flow node with no special control behavior.
   */
  | { kind: "regular" }
  /**
   * Represents a block that contains function calls in its expressions.
   * `callees` refers to unique indices of the callee within the CFG.
   * Functions which definitions are not available in the current
   * compilation unit are omitted.
   */
  | { kind: "call"; callees: Set<CfgIdx> }
  /**
   * Represents an exit node that effectively terminates the execution of the current control flow.
   */
  | { kind: "exit" };

/**
 * Represents a basic block in a CFG, corresponding to a single
 * statement in the source code.
 * Basic blocks are connected by edges that represent the flow of control between statements.
 *
 * @param stmtID The unique identifier of the statement this block represents.
 * @param kind Kind of the basic block representing ways it behave.
 * @param srcEdges A set of indices for edges incoming to this block, representing control flows leading into this statement.
 * @param dstEdges A set of indices for edges outgoing from this block, representing potential control flows out of this statement.
 */
export class BasicBlock {
  public idx: BasicBlockIdx;
  constructor(
    public stmtID: AstStatement["id"],
    public kind: BasicBlockKind,
    public srcEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
    public dstEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
  ) {
    this.idx = IdxGenerator.next("cfg_bb") as BasicBlockIdx;
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
 * Describes the intraprocedural CFG that corresponds to a function or method within the project.
 */
export class Cfg {
  /**
   * The unique identifier of this CFG among the compilation unit it belongs to.
   */
  public idx: CfgIdx;

  /**
   * Map from unique basic block indices to array indices in the `this.bbs`.
   */
  private bbsMap: Map<BasicBlockIdx, number>;

  /**
   * Map from unique edge indices to array indices in the `this.edges`.
   */
  private edgesMap: Map<EdgeIdx, number>;

  /**
   * Creates an instance of CFG.
   * @param name The name of the function or method this CFG represents.
   * @param id AST ID.
   * @param kind Indicates whether this CFG represents a standalone function or a method or a receive method belonging to a contract.
   * @param origin Indicates whether the function was defined in users code or in standard library.
   * @param nodes Map of block indices to basic blocks in the CFG that come in the reverse order.
   * @param edges Map of edge indices to edges in the CFG that come in the reverse order.
   * @param ref AST reference that corresponds to the function definition.
   * @param idx An optional unique index. If not set, a new one will be chosen automatically.
   */
  constructor(
    public name: FunctionName,
    public id: AstNode["id"],
    public kind: FunctionKind,
    public origin: ItemOrigin,
    public nodes: BasicBlock[],
    public edges: Edge[],
    public ref: SrcInfo,
    idx: CfgIdx | undefined = undefined,
  ) {
    this.idx = idx ? idx : (IdxGenerator.next("cfg") as CfgIdx);
    this.bbsMap = new Map();
    this.initializeMapping(this.bbsMap, nodes);
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
   * @param idx The index of the basic block to retrieve.
   * @returns The basic block if found, otherwise undefined.
   */
  public getBasicBlock(idx: BasicBlockIdx): BasicBlock | undefined {
    const bbsIdx = this.bbsMap.get(idx);
    return bbsIdx === undefined ? undefined : this.nodes[bbsIdx];
  }

  /**
   * Retrieves an Edge from the CFG based on its unique index.
   * @param idx The index of the edge to retrieve.
   * @returns The Edge if found, otherwise undefined.
   */
  public getEdge(idx: EdgeIdx): Edge | undefined {
    const edgesIdx = this.edgesMap.get(idx);
    return edgesIdx === undefined ? undefined : this.edges[edgesIdx];
  }

  private traverseBasicBlocks(
    edgeIdxs: Set<EdgeIdx>,
    isSrc: boolean,
  ): BasicBlock[] | undefined {
    return Array.from(edgeIdxs).reduce(
      (acc, srcIdx) => {
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
   * Returns successors for the given block.
   * @returns A list of predecessor blocks or `undefined` if any of the indices cannot be found in this CFG.
   */
  public getSuccessors(bbIdx: BasicBlockIdx): BasicBlock[] | undefined {
    const bb = this.getBasicBlock(bbIdx);
    return bb === undefined
      ? undefined
      : this.traverseBasicBlocks(bb.dstEdges, false);
  }

  /**
   * Returns predecessors for the given block.
   * @returns A list of predecessor blocks or `undefined` if any of the indices cannot be found in this CFG.
   */
  public getPredecessors(bbIdx: BasicBlockIdx): BasicBlock[] | undefined {
    const bb = this.getBasicBlock(bbIdx);
    return bb === undefined
      ? undefined
      : this.traverseBasicBlocks(bb.srcEdges, true);
  }

  /**
   * Iterates over all basic blocks in a CFG, applying a callback to each node.
   * The callback can perform any operation, such as analyzing or transforming the basic block.
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each block.
   */
  public forEachBasicBlock(
    astStore: AstStore,
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

  /**
   * Returns a list of all exit nodes in the CFG.
   * @returns An array of `BasicBlock` that are exit nodes.
   */
  public getExitNodes(): BasicBlock[] {
    return this.nodes.filter((bb) => bb.isExit());
  }
}

/**
 * An utility function that extracts basic block's predecessors.
 */
export function getPredecessors(cfg: Cfg, bb: BasicBlock): BasicBlock[] {
  const predecessors = cfg.getPredecessors(bb.idx);
  if (predecessors === undefined) {
    throw InternalException.make(
      `Incorrect definition in the Cfg: BB #${bb.idx} has an undefined predecessor`,
    );
  }
  return predecessors;
}

/**
 * An utility function that extracts basic blocks's successors.
 */
export function getSuccessors(cfg: Cfg, bb: BasicBlock): BasicBlock[] {
  const successors = cfg.getSuccessors(bb.idx);
  if (successors === undefined) {
    throw InternalException.make(
      `Incorrect definition in the Cfg: BB #${bb.idx} has an undefined predecessor`,
    );
  }
  return successors;
}
