import { unreachable } from "../util";
import { TactASTStore } from "./astStore";
import { IdxGenerator } from "./indices";
import { MistiContext } from "../../";
import { Logger } from "../../internals/logger";
import { forEachExpression } from "../tact/iterators";
import {
  AstFunctionDef,
  AstReceiver,
  AstContractInit,
  AstExpression,
  AstMethodCall,
  AstStaticCall,
} from "@tact-lang/compiler/dist/grammar/ast";

export type CGNodeId = number & { readonly brand: unique symbol };
type CGEdgeId = number & { readonly brand: unique symbol };

/**
 * Represents an edge in the call graph, indicating a call from one function to another.
 */
class CGEdge {
  public idx: CGEdgeId;

  constructor(
    public src: CGNodeId,
    public dst: CGNodeId,
  ) {
    this.idx = IdxGenerator.next("cg_edge") as CGEdgeId;
  }
}

/**
 * Represents a node in the call graph, corresponding to a function or method.
 */
class CGNode {
  public idx: CGNodeId;
  public inEdges: Set<CGEdgeId> = new Set();
  public outEdges: Set<CGEdgeId> = new Set();

  /**
   * @param astId AST id of the relevant function definition. It might be `undefined` if this node doesn’t have a corresponding AST entry,
   * which indicates an issue in Misti.
   */
  constructor(
    public astId: number | undefined,
    public name: string,
    private logger: Logger,
  ) {
    this.idx = IdxGenerator.next("cg_node") as CGNodeId;
    if (astId === undefined) {
      this.logger.debug(`CGNode created without AST ID for function "${name}"`);
    }
  }
}

/**
 * The `CallGraph` class represents a directed graph where nodes correspond to functions
 * or methods in a program, and edges indicate calls between them.
 */
export class CallGraph {
  private nodeMap: Map<CGNodeId, CGNode> = new Map();
  private astIdToNodeId: Map<number, CGNodeId> = new Map();
  private nameToNodeId: Map<string, CGNodeId> = new Map();
  private edgesMap: Map<CGEdgeId, CGEdge> = new Map();
  private logger: Logger;

  constructor(private ctx: MistiContext) {
    this.logger = ctx.logger;
  }

  public getNodes(): Map<CGNodeId, CGNode> {
    return this.nodeMap;
  }

  public getEdges(): Map<CGEdgeId, CGEdge> {
    return this.edgesMap;
  }

  /**
   * Retrieves the node ID associated with a given function name.
   * @param name The function name.
   * @returns The corresponding node ID, or undefined if not found.
   */
  public getNodeIdByName(name: string): CGNodeId | undefined {
    return this.nameToNodeId.get(name);
  }

  /**
   * Retrieves the node ID associated with a given AST node ID.
   * @param astId The AST node ID.
   * @returns The corresponding node ID, or undefined if not found.
   */
  public getNodeIdByAstId(astId: number): CGNodeId | undefined {
    return this.astIdToNodeId.get(astId);
  }

  /**
   * Retrieves a node from the graph by its ID.
   * @param nodeId The ID of the node.
   * @returns The `CGNode` instance, or undefined if not found.
   */
  public getNode(nodeId: CGNodeId): CGNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  /**
   * Determines if there exists a path in the call graph from the source node to the destination node.
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
   * Builds the call graph based on functions in the provided AST store.
   */
  public build(astStore: TactASTStore): CallGraph {
    for (const func of astStore.getFunctions()) {
      const funcName = this.generateFunctionName(func);
      if (funcName) {
        const node = new CGNode(func.id, funcName, this.logger);
        this.nodeMap.set(node.idx, node);
        this.nameToNodeId.set(funcName, node.idx);
        if (func.id !== undefined) {
          this.astIdToNodeId.set(func.id, node.idx);
        }
      } else {
        this.logger.error(
          `Function with id ${func.id} has no name and will be skipped.`,
        );
      }
    }
    this.analyzeFunctionCalls(astStore);
    return this;
  }

  /**
   * Generates a unique function name based on its type.
   * This method is used internally during the build process.
   */
  private generateFunctionName(
    func: AstFunctionDef | AstReceiver | AstContractInit,
  ): string | undefined {
    switch (func.kind) {
      case "function_def":
        return func.name?.text;
      case "contract_init":
        return `contract_init_${func.id}`;
      case "receiver":
        return `receiver_${func.id}`;
      default:
        unreachable(func);
    }
  }

  /**
   * Analyzes function calls in the AST store and adds corresponding edges in the call graph.
   */
  private analyzeFunctionCalls(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
      const funcNodeId = this.astIdToNodeId.get(func.id);
      if (funcNodeId !== undefined) {
        forEachExpression(func, (expr) =>
          this.processExpression(expr, funcNodeId),
        );
      } else {
        this.logger.warn(`Caller function with AST ID ${func.id} not found.`);
      }
    }
  }

  /**
   * Processes an expression, identifying static and method calls to add edges.
   */
  private processExpression(expr: AstExpression, callerId: CGNodeId) {
    if (expr.kind === "static_call") {
      const staticCall = expr as AstStaticCall;
      const functionName = staticCall.function?.text;
      if (functionName) {
        const calleeId = this.findOrAddFunction(functionName);
        this.addEdge(callerId, calleeId);
      } else {
        this.logger.warn(
          `Static call expression missing function name at caller ${callerId}`,
        );
      }
    } else if (expr.kind === "method_call") {
      const methodCall = expr as AstMethodCall;
      const methodName = methodCall.method?.text;
      if (methodName) {
        const calleeId = this.findOrAddFunction(methodName);
        this.addEdge(callerId, calleeId);
      } else {
        this.logger.warn(
          `Method call expression missing method name at caller ${callerId}`,
        );
      }
    }
  }

  /**
   * Finds or adds a function to the call graph by name.
   */
  private findOrAddFunction(name: string): CGNodeId {
    const nodeId = this.nameToNodeId.get(name);
    if (nodeId !== undefined) {
      return nodeId;
    }
    const newNode = new CGNode(undefined, name, this.logger);
    this.nodeMap.set(newNode.idx, newNode);
    this.nameToNodeId.set(name, newNode.idx);
    return newNode.idx;
  }

  /**
   * Adds an edge between two nodes in the call graph.
   */
  private addEdge(src: CGNodeId, dst: CGNodeId) {
    const srcNode = this.nodeMap.get(src);
    const dstNode = this.nodeMap.get(dst);
    if (srcNode && dstNode) {
      const edge = new CGEdge(src, dst);
      this.edgesMap.set(edge.idx, edge);
      srcNode.outEdges.add(edge.idx);
      dstNode.inEdges.add(edge.idx);
    } else {
      this.logger.warn(
        `Cannot add edge from ${src} to ${dst}: node(s) not found.`,
      );
    }
  }
}
