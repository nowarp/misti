import { unreachable } from "../util";
import { TactASTStore } from "./astStore";
import { IdxGenerator } from "./indices";
import { forEachExpression } from "../tact/iterators";
import {
  AstFunctionDef,
  AstReceiver,
  AstContractInit,
  AstExpression,
  AstStaticCall,
  AstMethodCall,
} from "@tact-lang/compiler/dist/grammar/ast";

// Define types for node and edge identifiers
export type CGNodeId = number;
export type CGEdgeId = number;

/**
 * Represents an edge in the call graph, indicating a call from one function to another.
 */
export class CGEdge {
  public idx: CGEdgeId;

  /**
   * Creates a new edge in the call graph.
   * @param src The source node ID (caller function).
   * @param dst The destination node ID (callee function).
   */
  constructor(
    public src: CGNodeId,
    public dst: CGNodeId,
  ) {
    this.idx = IdxGenerator.next("cg_edge");
  }
}

/**
 * Represents a node in the call graph, corresponding to a function or method.
 */
export class CGNode {
  public idx: CGNodeId;
  public inEdges: Set<CGEdgeId> = new Set();
  public outEdges: Set<CGEdgeId> = new Set();

  /**
   * Creates a new node in the call graph.
   * @param astId The AST node ID associated with this function, if any.
   * @param name The name of the function or method.
   */
  constructor(
    public astId: number | undefined,
    public name: string,
  ) {
    this.idx = IdxGenerator.next("cg_node");
  }
}

/**
 * Represents call graph, managing nodes (functions) and edges (calls).
 */
export class CallGraph {
  private nodeMap: Map<CGNodeId, CGNode> = new Map();
  private edgesMap: Map<CGEdgeId, CGEdge> = new Map();
  private nameToNodeId: Map<string, CGNodeId> = new Map();

  /**
   * Retrieves all nodes in the call graph.
   * @returns A map of node IDs to `CGNode` instances.
   */
  public getNodes(): Map<CGNodeId, CGNode> {
    return this.nodeMap;
  }

  /**
   * Retrieves all edges in the call graph.
   * @returns A map of edge IDs to `CGEdge` instances.
   */
  public getEdges(): Map<CGEdgeId, CGEdge> {
    return this.edgesMap;
  }

  /**
   * Builds call graph from the provided AST store.
   * @param astStore The AST store containing function definitions.
   * @returns The constructed `CallGraph` instance.
   */
  public build(astStore: TactASTStore): CallGraph {
    this.addFunctionsToNodes(astStore);
    this.analyzeFunctionCalls(astStore);
    return this;
  }

  /**
   * Determines whether there is a path from the source node to the destination node.
   * @param src The source node ID.
   * @param dst The destination node ID.
   * @returns `true` if a path exists, `false` otherwise.
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

  // Adds functions from the AST store to the call graph as nodes.
  private addFunctionsToNodes(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        const node = new CGNode(func.id, funcName);
        this.nodeMap.set(node.idx, node);
        this.nameToNodeId.set(funcName, node.idx);
      } else {
        console.warn(
          `Function with id ${func.id} has no name and will be skipped.`,
        );
      }
    }
  }

  // Analyzes function bodies to identify function calls and adds edges accordingly.
  private analyzeFunctionCalls(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        const callerId = this.getNodeIdByName(funcName);
        if (callerId !== undefined) {
          this.processFunctionBody(func, callerId);
        } else {
          console.warn(`Caller function ${funcName} not found in node map.`);
        }
      }
    }
  }

  // Retrieves function name based on its kind.
  private getFunctionName(
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
        return undefined;
    }
  }

  // Gets node ID associated with a given function name.
  private getNodeIdByName(name: string): CGNodeId | undefined {
    return this.nameToNodeId.get(name);
  }

  // Processes body of a function to find function calls.
  private processFunctionBody(
    func: AstFunctionDef | AstReceiver | AstContractInit,
    callerId: CGNodeId,
  ) {
    forEachExpression(func, (expr) => {
      this.processExpression(expr, callerId);
    });
  }

  // Processes an expression to identify function calls and adds edges.
  private processExpression(expr: AstExpression, callerId: CGNodeId) {
    if (expr.kind === "static_call") {
      const staticCall = expr as AstStaticCall;
      const functionName = staticCall.function?.text;
      if (functionName) {
        const calleeId = this.findOrAddFunction(functionName);
        this.addEdge(callerId, calleeId);
      } else {
        console.warn(
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
        console.warn(
          `Method call expression missing method name at caller ${callerId}`,
        );
      }
    }
  }

  // Finds an existing function node by name or adds a new one if it doesn't exist.
  private findOrAddFunction(name: string): CGNodeId {
    const nodeId = this.nameToNodeId.get(name);
    if (nodeId !== undefined) {
      return nodeId;
    }

    const newNode = new CGNode(undefined, name);
    this.nodeMap.set(newNode.idx, newNode);
    this.nameToNodeId.set(name, newNode.idx);
    return newNode.idx;
  }

  // Adds an edge between two nodes in the call graph.
  private addEdge(src: CGNodeId, dst: CGNodeId) {
    const srcNode = this.nodeMap.get(src);
    const dstNode = this.nodeMap.get(dst);
    if (srcNode && dstNode) {
      const edge = new CGEdge(src, dst);
      this.edgesMap.set(edge.idx, edge);
      srcNode.outEdges.add(edge.idx);
      dstNode.inEdges.add(edge.idx);
    } else {
      console.warn(`Cannot add edge from ${src} to ${dst}: node(s) not found.`);
    }
  }
}
