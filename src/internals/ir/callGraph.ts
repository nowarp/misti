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

class CGEdge {
  public idx: number;
  public src: number;
  public dst: number;

  constructor(src: number, dst: number) {
    this.idx = IdxGenerator.next("cg_edge");
    this.src = src;
    this.dst = dst;
  }
}

class CGNode {
  public idx: number;
  constructor(
    public astId: number,
    public name: string,
  ) {
    this.idx = IdxGenerator.next("cg_node");
  }
}

export class CallGraph {
  public nodes: CGNode[] = [];
  public edges: CGEdge[] = [];
  private nodeMap: Map<number, CGNode> = new Map();
  private edgeMap: Map<number, Set<number>> = new Map();
  private astStore!: TactASTStore;

  constructor() {}
  build(astStore: TactASTStore): CallGraph {
    this.astStore = astStore;
    this.addFunctionsToNodes();
    this.analyzeFunctionCalls();
    return this;
  }

  private addFunctionsToNodes() {
    for (const func of this.astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        const node = new CGNode(func.id, funcName);
        this.nodes.push(node);
        this.nodeMap.set(func.id, node);
      }
    }
  }

  private analyzeFunctionCalls() {
    for (const func of this.astStore.getFunctions()) {
      const funcName = this.getFunctionName(func);
      if (funcName) {
        this.processStatements(func.statements, func.id);
      }
    }
  }

  private getFunctionName(
    func: AstFunctionDef | AstReceiver | AstContractInit,
  ): string | undefined {
    switch (func.kind) {
      case "function_def":
        return func.name.text;
      case "contract_init":
        return "contract_init";
      case "receiver":
        return "receiver";
      default:
        unreachable(func);
    }
  }

  private processStatements(statements: AstStatement[], callerId: number) {
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
          if ("expression" in stmt && stmt.expression) {
            this.processExpression(stmt.expression, callerId);
          }
          break;
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

  private processExpression(
    expr: AstExpression | AstStructFieldInitializer,
    callerId: number,
  ) {
    this.forEachExpression(expr, (nestedExpr) => {
      let calleeId: number | undefined;

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

  private forEachExpression(
    expr: AstExpression | AstStructFieldInitializer,
    callback: (expr: AstExpression | AstStructFieldInitializer) => void,
  ) {
    // Call the callback for the current expression
    callback(expr);

    // Ensure that the current expression is an object before processing further
    if (typeof expr === "object" && expr !== null) {
      // Recursively process nested expressions if they exist
      if ("args" in expr && Array.isArray(expr.args)) {
        for (const arg of expr.args) {
          this.forEachExpression(arg, callback);
        }
      } else if ("value" in expr) {
        const initializer = expr as any;
        if (initializer.value) {
          this.forEachExpression(initializer.value, callback);
        }
      }
    }
  }

  private findOrAddFunction(name: string): number {
    const existingFunc = Array.from(this.nodeMap.values()).find(
      (node) => node.name === name,
    );
    if (existingFunc) return existingFunc.astId;

    const newNode = new CGNode(IdxGenerator.next("node"), name);
    this.nodes.push(newNode);
    this.nodeMap.set(newNode.astId, newNode);
    return newNode.astId;
  }

  private addEdge(src: number, dst: number) {
    if (!this.areConnected(src, dst)) {
      const edge = new CGEdge(src, dst);
      this.edges.push(edge);

      if (!this.edgeMap.has(src)) {
        this.edgeMap.set(src, new Set());
      }
      this.edgeMap.get(src)!.add(dst);
    }
  }

  areConnected(src: number, dst: number): boolean {
    const edgesFromSrc = this.edgeMap.get(src);
    return edgesFromSrc ? edgesFromSrc.has(dst) : false;
  }

  exportToDOT(): string {
    let dot = "digraph CallGraph {\n";
    for (const node of this.nodes) {
      dot += `  "${node.name}" [label="${node.name}"];\n`;
    }
    for (const edge of this.edges) {
      const srcNode = this.nodeMap.get(edge.src);
      const dstNode = this.nodeMap.get(edge.dst);
      if (srcNode && dstNode) {
        dot += `  "${srcNode.name}" -> "${dstNode.name}";\n`;
      } else {
        console.warn(`Missing node for edge: ${edge.src} -> ${edge.dst}`);
      }
    }
    dot += "}";
    return dot;
  }
}
