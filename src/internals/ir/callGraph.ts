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

type CGNodeId = number & { readonly brand: unique symbol };
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

  constructor(
    public astId: number | undefined,
    public name: string,
  ) {
    this.idx = IdxGenerator.next("cg_node") as CGNodeId;
  }
}

export class CallGraph {
  private nodeMap: Map<CGNodeId, CGNode> = new Map();
  private edgesMap: Map<CGEdgeId, CGEdge> = new Map();
  private nameToNodeId: Map<string, CGNodeId> = new Map();
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

  public build(astStore: TactASTStore): CallGraph {
    for (const func of astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        const node = new CGNode(func.id, funcName);
        this.nodeMap.set(node.idx, node);
        this.nameToNodeId.set(funcName, node.idx);
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
 * Determines if there exists a path in the call graph from the source node to the destination node.
 * This method performs a breadth-first search to find if the destination node is reachable from the source node.
 * 
 * @param src - The ID of the source node to start the search from
 * @param dst - The ID of the destination node to search for
 * @returns true if there exists a path from src to dst in the call graph, false otherwise
 *          Returns false if either src or dst node IDs are not found in the graph
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

  private analyzeFunctionCalls(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        const callerId = this.nameToNodeId.get(funcName);
        if (callerId !== undefined) {
          forEachExpression(func, (expr) =>
            this.processExpression(expr, callerId),
          );
        } else {
          this.logger.warn(
            `Caller function ${funcName} not found in node map.`,
          );
        }
      }
    }
  }

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
    }
  }

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
