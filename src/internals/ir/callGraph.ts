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

export type CGNodeId = number;
export type CGEdgeId = number;

export class CGEdge {
  public idx: CGEdgeId;
  constructor(
    public src: CGNodeId,
    public dst: CGNodeId,
  ) {
    this.idx = IdxGenerator.next("cg_edge");
  }
}

export class CGNode {
  public idx: CGNodeId;
  public inEdges: Set<CGEdgeId> = new Set();
  public outEdges: Set<CGEdgeId> = new Set();
  constructor(
    public astId: number | undefined,
    public name: string,
  ) {
    this.idx = IdxGenerator.next("cg_node");
  }
}

export class CallGraph {
  private nodeMap: Map<CGNodeId, CGNode> = new Map();
  private edgesMap: Map<CGEdgeId, CGEdge> = new Map();
  private nameToNodeId: Map<string, CGNodeId> = new Map();

  public getNodes(): Map<CGNodeId, CGNode> {
    return this.nodeMap;
  }

  public getEdges(): Map<CGEdgeId, CGEdge> {
    return this.edgesMap;
  }

  build(astStore: TactASTStore): CallGraph {
    this.addFunctionsToNodes(astStore);
    this.analyzeFunctionCalls(astStore);
    return this;
  }

  private addFunctionsToNodes(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        const node = new CGNode(func.id, funcName);
        this.nodeMap.set(node.idx, node);
        this.nameToNodeId.set(funcName, node.idx);
      }
    }
  }

  private analyzeFunctionCalls(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
      const callerId = this.getNodeIdByName(this.getFunctionName(func));
      if (callerId !== undefined) {
        this.processFunctionBody(func, callerId);
      }
    }
  }

  private getFunctionName(
    func: AstFunctionDef | AstReceiver | AstContractInit,
  ): string {
    switch (func.kind) {
      case "function_def":
        return func.name.text;
      case "contract_init":
        return `contract_init_${func.id}`;
      case "receiver":
        return `receiver_${func.id}`;
      default:
        unreachable(func);
    }
  }

  private getNodeIdByName(name: string): CGNodeId | undefined {
    return this.nameToNodeId.get(name);
  }

  private processFunctionBody(
    func: AstFunctionDef | AstReceiver | AstContractInit,
    callerId: CGNodeId,
  ) {
    forEachExpression(func, (expr) => {
      this.processExpression(expr, callerId);
    });
  }

  private processExpression(expr: AstExpression, callerId: CGNodeId) {
    if (expr.kind === "static_call") {
      const staticCall = expr as AstStaticCall;
      const functionName = staticCall.function.text;
      const calleeId = this.findOrAddFunction(functionName);
      this.addEdge(callerId, calleeId);
    } else if (expr.kind === "method_call") {
      const methodCall = expr as AstMethodCall;
      const methodName = methodCall.method.text;
      const calleeId = this.findOrAddFunction(methodName);
      this.addEdge(callerId, calleeId);
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
    }
  }

  areConnected(src: CGNodeId, dst: CGNodeId): boolean {
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
}
