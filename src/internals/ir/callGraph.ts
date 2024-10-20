import { unreachable } from "../util";
import { TactASTStore } from "./astStore";
import { IdxGenerator } from "./indices";
import {
  AstFunctionDef,
  AstReceiver,
  AstContractInit,
  AstStatement,
  AstStaticCall,
  AstMethodCall,
  AstExpression,
  AstStructFieldInitializer,
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
    public astId: number,
    public name: string,
  ) {
    this.idx = IdxGenerator.next("cg_node");
  }
}

/**
 * The main CallGraph class, which stores the nodes and edges of the graph.
 */
export class CallGraph {
  private nodeMap: Map<CGNodeId, CGNode> = new Map();
  private edgesMap: Map<CGEdgeId, CGEdge> = new Map();
  public getNodes(): Map<CGNodeId, CGNode> {
    return this.nodeMap;
  }
  public getEdges(): Map<CGEdgeId, CGEdge> {
    return this.edgesMap;
  }

  /**
   * Build the call graph by analyzing the AST store.
   * @param astStore - The AST store containing functions and contracts.
   */
  build(astStore: TactASTStore): CallGraph {
    this.addFunctionsToNodes(astStore);
    this.analyzeFunctionCalls(astStore);
    return this;
  }

  /**
   * Add functions from the AST store to the call graph as nodes.
   * @param astStore - The AST store containing functions.
   */
  private addFunctionsToNodes(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        const node = new CGNode(func.id, funcName);
        this.nodeMap.set(func.id, node);
      }
    }
  }

  /**
   * Analyze function calls in the AST store to add edges to the graph.
   * @param astStore - The AST store containing function definitions.
   */
  private analyzeFunctionCalls(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        this.processStatements(func.statements, func.id);
      }
    }
  }

  /**
   * Get the function name based on the type of function (function, receiver, or contract initializer).
   * @param func - The function definition or initializer.
   * @returns The name of the function.
   */
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

  /**
   * Process the statements of a function to identify calls and add them to the call graph.
   * @param statements - The AST statements.
   * @param callerId - The ID of the calling function.
   */
  private processStatements(statements: AstStatement[], callerId: CGNodeId) {
    for (const stmt of statements) {
      switch (stmt.kind) {
        case "statement_expression":
          this.processExpression(stmt.expression, callerId);
          break;
        case "statement_condition":
          this.processStatements(stmt.trueStatements, callerId);
          if (stmt.falseStatements) {
            this.processStatements(stmt.falseStatements, callerId);
          }
          break;
        case "statement_while":
        case "statement_until":
        case "statement_repeat":
        case "statement_foreach":
          this.processStatements(stmt.statements, callerId);
          break;
        case "statement_try":
          this.processStatements(stmt.statements, callerId);
          break;
        case "statement_try_catch":
          this.processStatements(stmt.statements, callerId);
          this.processStatements(stmt.catchStatements, callerId);
          break;
        case "statement_let":
        case "statement_return":
        case "statement_assign":
        case "statement_augmentedassign":
          if (stmt.expression) {
            this.processExpression(stmt.expression, callerId);
          }
          break;
        default:
          console.warn(`Unhandled statement type: ${(stmt as any).kind}`, stmt);
      }
    }
  }

  /**
   * Process expressions within statements to identify function calls.
   * @param expr - The expression to process.
   * @param callerId - The ID of the calling function.
   */
  private processExpression(
    expr: AstExpression | AstStructFieldInitializer,
    callerId: CGNodeId,
  ) {
    this.forEachExpression(expr, (nestedExpr) => {
      let calleeId: CGNodeId | undefined;
      if (nestedExpr.kind === "static_call") {
        const staticCall = nestedExpr as AstStaticCall;
        calleeId = this.findOrAddFunction(staticCall.function.text);
      } else if (nestedExpr.kind === "method_call") {
        const methodCall = nestedExpr as AstMethodCall;
        calleeId = this.findOrAddFunction(methodCall.method.text);
      }
      if (calleeId !== undefined) {
        this.addEdge(callerId, calleeId);
      }
    });
  }

  /**
   * Traverse the expressions and apply a callback function to each one.
   * @param expr - The expression to traverse.
   * @param callback - The callback function to apply to each nested expression.
   */
  private forEachExpression(
    expr: AstExpression | AstStructFieldInitializer,
    callback: (expr: AstExpression) => void,
  ) {
    if (expr.kind !== "struct_field_initializer") {
      callback(expr as AstExpression);
    }
    switch (expr.kind) {
      case "static_call":
      case "method_call": {
        const callExpr = expr as AstStaticCall | AstMethodCall;
        for (const arg of callExpr.args) {
          this.forEachExpression(arg, callback);
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Find or add a function to the graph by name.
   * @param name - The function name.
   * @returns The ID of the function node.
   */
  private findOrAddFunction(name: string): CGNodeId {
    const existingNode = Array.from(this.nodeMap.values()).find(
      (node: CGNode) => node.name === name,
    );
    if (existingNode) {
      return existingNode.astId;
    }
    const newNode = new CGNode(IdxGenerator.next("cg_node"), name);
    this.nodeMap.set(newNode.astId, newNode);
    return newNode.astId;
  }

  /**
   * Add an edge between two nodes in the graph.
   * @param src - The source node ID.
   * @param dst - The destination node ID.
   */
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

  /**
   * Check if two nodes are connected in the graph.
   * @param src - The source node ID.
   * @param dst - The destination node ID.
   * @returns True if connected, false otherwise.
   */
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
