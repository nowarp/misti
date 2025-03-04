import { AstStore } from "./astStore";
import { IdxGenerator } from "./indices";
import { AstNodeId, InternalException, isSelf } from "../../";
import { Logger } from "../../internals/logger";
import {
  AstNode,
  AstModule,
  AstStaticCall,
  AstMethodCall,
  idText,
  SrcInfo,
  prettyPrint as pp,
} from "../../internals/tact/imports";

export type CGNodeId = number & { readonly brand: unique symbol };
export type CGEdgeId = number & { readonly brand: unique symbol };

/** Effects flags for callgraph nodes. */
export enum Effect {
  /** Uses functions that send funds. */
  Send = 1 << 0,
  /** Reads contract's state. */
  StateRead = 1 << 1,
  /** Writes contract's state. */
  StateWrite = 1 << 2,
  /** Accesses datetime functions. */
  AccessDatetime = 1 << 3,
  /** Uses PRG. */
  PrgUse = 1 << 4,
  /** Inits PRG seed. */
  PrgSeedInit = 1 << 5,
}

/**
 * Represents an edge in the call graph, indicating a call from one function to another.
 */
export class CGEdge {
  public idx: CGEdgeId;

  /**
   * @param src The source node ID representing the calling function
   * @param dst The destination node ID representing the called function
   */
  constructor(
    public src: CGNodeId,
    public dst: CGNodeId,
  ) {
    this.idx = IdxGenerator.next("cg_edge") as CGEdgeId;
  }
}

export type StateKind = "read" | "write";

/**
 * Represents a node in the call graph, corresponding to a function or method.
 */
export class CGNode {
  public idx: CGNodeId;
  public inEdges: Set<CGEdgeId> = new Set();
  public outEdges: Set<CGEdgeId> = new Set();
  public astId: AstNodeId | undefined;
  public loc: SrcInfo | undefined;
  public effects: number = 0;
  public stateAccess: Map<StateKind, Set<string>> = new Map();

  /**
   * @param node The AST node of the function. Can be `undefined` for call nodes.
   * @param name The name of the function or method
   * @param logger A logger instance for logging messages
   */
  constructor(
    node: Exclude<AstNode, AstModule> | undefined,
    public name: string,
    private logger: Logger,
  ) {
    this.stateAccess.set("read", new Set());
    this.stateAccess.set("write", new Set());
    this.idx = IdxGenerator.next("cg_node") as CGNodeId;
    if (node === undefined) {
      this.logger.debug(`CGNode created without AST ID for function "${name}"`);
    } else {
      if ("id" in node) {
        this.astId = node.id;
      } else {
        throw InternalException.make(`Node without id: ${node.kind}`);
      }
      if ("loc" in node) {
        this.loc = node.loc;
      } else {
        throw InternalException.make(`Node without loc: ${node.kind}`);
      }
    }
  }

  /**
   * @param fields Names of contract fields accessed or modified by the effect.
   */
  public addEffect(effect: Effect, fields?: string[]) {
    this.effects |= effect;
    if (fields !== undefined) {
      const status =
        effect === Effect.StateRead
          ? "read"
          : effect === Effect.StateWrite
            ? "write"
            : undefined;
      if (status === undefined) {
        throw InternalException.make(`Unknown effect: ${effect}`);
      }
      fields.forEach((f) => this.stateAccess.get(status)!.add(f));
    }
  }

  public hasEffect(effect: Effect): boolean {
    return (this.effects & effect) !== 0;
  }

  public hasAnyEffect(...effects: Effect[]): boolean {
    return effects.some((effect) => this.hasEffect(effect));
  }

  /**
   * Pretty-prints a signature of the function is available
   */
  public signature(ast: AstStore): string | undefined {
    if (!this.astId) return undefined;
    const fun = ast.getFunction(this.astId);
    if (!fun) return undefined;
    let signature = pp(fun).split("{")[0].replace(/\s+/g, " ").trim();
    const parts = this.name.split("::");
    if (parts.length > 1 && !signature.includes("::")) {
      const contractName = parts[0];
      if (signature.includes(" fun ")) {
        const lastFunIndex = signature.lastIndexOf(" fun ") + 5;
        signature =
          signature.substring(0, lastFunIndex) +
          contractName +
          "::" +
          signature.substring(lastFunIndex);
      } else if (signature.startsWith("fun ")) {
        signature = "fun " + contractName + "::" + signature.substring(4);
      } else {
        signature = contractName + "::" + signature;
      }
    }
    return signature;
  }
}

/**
 * Represents the call graph, a directed graph where nodes represent functions or methods,
 * and edges indicate calls between them.
 */
export class CallGraph {
  constructor(
    private readonly nodeMap: Map<CGNodeId, CGNode>,
    private readonly astIdToNodeId: Map<AstNodeId, CGNodeId>,
    private readonly nameToNodeId: Map<string, CGNodeId>,
    private readonly edgesMap: Map<CGEdgeId, CGEdge>,
  ) {}

  /**
   * Retrieves all nodes in the call graph.
   * @returns A map of all nodes by their unique IDs.
   */
  public getNodes(): Map<CGNodeId, CGNode> {
    return this.nodeMap;
  }

  /**
   * Retrieves all edges in the call graph.
   * @returns A map of all edges by their unique IDs.
   */
  public getEdges(): Map<CGEdgeId, CGEdge> {
    return this.edgesMap;
  }

  /**
   * Retrieves a node's ID by its name.
   * @param name The name of the function or method.
   * @returns The corresponding node ID, or `undefined` if not found.
   */
  public getNodeIdByName(name: string): CGNodeId | undefined {
    return this.nameToNodeId.get(name);
  }

  /**
   * Retrieves a node's ID by the AST ID of its definition.
   * @param astId The AST ID of the function definition.
   * @returns The corresponding node ID, or `undefined` if not found.
   */
  public getNodeIdByAstId(astId: AstNodeId): CGNodeId | undefined {
    return this.astIdToNodeId.get(astId);
  }

  /**
   * Retrieves a node by its ID.
   * @param nodeId The unique ID of the node.
   * @returns The corresponding node, or `undefined` if not found.
   */
  public getNode(nodeId: CGNodeId): CGNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  /**
   * Determines if there exists a path from the source node to the destination node.
   * This is achieved via a breadth-first search.
   *
   * @param src The ID of the source node.
   * @param dst The ID of the destination node.
   * @returns `true` if a path exists; `false` otherwise.
   */
  public areConnected(src: CGNodeId, dst: CGNodeId): boolean {
    const srcNode = this.nodeMap.get(src);
    const dstNode = this.nodeMap.get(dst);
    if (!srcNode || !dstNode) {
      return false;
    }
    const queue: CGNodeId[] = [src];
    const visited = new Set<CGNodeId>([src]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === dst) {
        return true;
      }
      const currentNode = this.nodeMap.get(current);
      if (currentNode) {
        for (const edgeId of currentNode.outEdges) {
          const edge = this.edgesMap.get(edgeId);
          if (edge && !visited.has(edge.dst)) {
            visited.add(edge.dst);
            queue.push(edge.dst);
          }
        }
      }
    }
    return false;
  }

  /**
   * Derives the function call name from a static or method call expression.
   * @param expr The call expression.
   * @param currentContractName The name of the current contract, if available.
   * @returns The fully qualified function name, or `undefined` if it is irrelevant.
   */
  public static getFunctionCallName(
    expr: AstStaticCall | AstMethodCall,
    currentContractName?: string,
  ): string | undefined {
    if (expr.kind === "static_call") {
      return expr.function.text;
    } else if (expr.kind === "method_call") {
      const methodName = idText(expr.method);
      // self.<method>()
      if (isSelf(expr.self)) {
        if (!currentContractName) {
          throw InternalException.make(
            `Cannot process ${pp(expr)} without current contract name`,
          );
        }
        return `${currentContractName}::${methodName}`;
      }
      // <struct/contract>.<method>()
      if (expr.self.kind === "id") {
        // TODO: Replace with actual contract name when #136 is resolved
        return `${idText(expr.self)}::${methodName}`;
      }
      // TODO: Support method call chains: #242
    }
    return undefined; // e.g. self.<map_field>.set()
  }
}
