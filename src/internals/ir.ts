import { ASTRef, ASTNode } from "@tact-lang/compiler/dist/grammar/ast";

export type ProjectName = string;

export class TactASTStore {
  constructor(public idxToNode: Map<number, ASTNode>) {}
}

export type EdgeIdx = number;
export type NodeIdx = number;

/**
 * Generates unique indexes is used to assign unique identifiers to nodes and edges,
 * ensuring that each element within the CFG can be distinctly referenced.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IdxGenerator {
  let currentIdx = 0;
  export function next(): number {
    currentIdx += 1;
    return currentIdx;
  }

  /**
   * Resets the current index number. For internal use only.
   */
  export function __reset() {
    currentIdx = 0;
  }
}

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
    public src: NodeIdx,
    public dst: NodeIdx,
  ) {
    this.idx = IdxGenerator.next();
  }
}

/**
 * Represents a node in a Control Flow Graph (CFG), corresponding to a single statement in the source code.
 * Nodes are connected by edges that represent the flow of control between statements.
 *
 * @param stmtID The unique identifier of the statement this node represents.
 * @param srcEdges A set of indices for edges incoming to this node, representing control flows leading into this statement.
 * @param dstEdges A set of indices for edges outgoing from this node, representing potential control flows out of this statement.
 */
export class Node {
  public idx: NodeIdx;
  constructor(
    public stmtID: number,
    public srcEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
    public dstEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
  ) {
    this.idx = IdxGenerator.next();
  }
}

export type FunctionName = string;
export type ContractName = string;

/**
 * Describes the interprocedural control flow graph (CFG) that corresponds to a function or method within the project.
 */
export class CFG {
  /**
   * Creates an instance of CFG.
   * @param name The name of the function or method this CFG represents.
   * @param ty Indicates whether this CFG represents a standalone function or a method belonging to a contract or class.
   * @param nodes An array of nodes in the CFG.
   * @param edges An array of edges in the CFG.
   * @param ref AST reference that corresponds to the function definition.
   */
  constructor(
    public name: FunctionName,
    public ty: "function" | "method",
    public nodes: Node[],
    public edges: Edge[],
    public ref: ASTRef,
  ) {}

  /**
   * Iterates over all nodes in a CFG, applying a callback to each node.
   * The callback can perform any operation, such as analyzing or transforming the node.
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each node.
   */
  forEachNode(
    astStore: TactASTStore,
    callback: (astNode: ASTNode, cfgNode: Node) => void,
  ) {
    this.nodes.forEach((cfgNode) => {
      const astNode = astStore.idxToNode.get(cfgNode.stmtID);
      if (astNode) {
        callback(astNode, cfgNode);
      } else {
        throw new Error(`No AST node found for statement ID ${cfgNode.stmtID}`);
      }
    });
  }
}

/**
 * Represents an entry for a contract in the compilation unit which
 * encapsulates a collection of related methods and their configurations.
 */
export class Contract {
  /**
   * Creates an instance of Contract.
   * @param name The unique name identifying this contract within the project.
   * @param methods A mapping of method names to their CFGs, representing the detailed flow and structure of each method included in the contract.
   * @param ref AST reference that corresponds to the contract definition.
   */
  constructor(
    public name: ContractName,
    public methods: Map<FunctionName, CFG>,
    public ref: ASTRef,
  ) {}
}

/**
 * Represents a Compilation Unit, encapsulating the information necessary for
 * analyzing a single Tact project.
 */
export class CompilationUnit {
  /**
   * Creates an instance of CompilationUnit.
   * @param projectName The name of the project this Compilation Unit belongs to.
   * @param ast The AST of the project.
   * @param functions A mapping from names of free functions to their CFGs.
   * @param contracts A set of contract entries, representing the contracts and their methods.
   */
  constructor(
    public projectName: ProjectName,
    public ast: TactASTStore,
    public functions: Map<FunctionName, CFG>,
    public contracts: Set<Contract>,
  ) {}

  /**
   * Iterates over all CFGs in a Compilation Unit, and applies a callback to each node in every CFG.
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each node within each CFG.
   */
  forEachCFG(
    astStore: TactASTStore,
    callback: (funName: string, astNode: ASTNode, cfgNode: Node) => void,
  ) {
    // Iterate over all functions' CFGs
    this.functions.forEach((cfg, functionName) => {
      cfg.forEachNode(astStore, (astNode, cfgNode) => {
        callback(functionName, astNode, cfgNode);
      });
    });

    // Iterate over all contracts and their methods' CFGs
    this.contracts.forEach((contract) => {
      contract.methods.forEach((cfg, methodName) => {
        cfg.forEachNode(astStore, (astNode, cfgNode) => {
          callback(`${contract.name}.${methodName}`, astNode, cfgNode);
        });
      });
    });
  }
}
