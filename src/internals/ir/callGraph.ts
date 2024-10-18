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

export class CGEdge {
  public idx: number;
  constructor(
    public src: number,
    public dst: number,
  ) {
    this.idx = IdxGenerator.next("cg_edge");
  }
}

export class CGNode {
  public idx: number;
  public inEdges: Set<number> = new Set();
  public outEdges: Set<number> = new Set();
  constructor(
    public astId: number,
    public name: string,
  ) {
    this.idx = IdxGenerator.next("cg_node");
  }
}

export class CallGraph {
  private nodeMap: Map<number, CGNode> = new Map();
  private edgesMap: Map<number, CGEdge> = new Map();
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
        this.nodeMap.set(func.id, node);
      }
    }
  }

  private analyzeFunctionCalls(astStore: TactASTStore) {
    for (const func of astStore.getFunctions()) {
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
        return `contract_init_${func.id}`;
      case "receiver":
        return `receiver_${func.id}`;
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
    callback(expr);

    if (typeof expr === "object" && expr !== null) {
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

  private addEdge(src: number, dst: number) {
    const srcNode = this.nodeMap.get(src);
    const dstNode = this.nodeMap.get(dst);
    if (srcNode && dstNode) {
      const edge = new CGEdge(src, dst);
      this.edgesMap.set(edge.idx, edge);
      srcNode.outEdges.add(edge.idx);
      dstNode.inEdges.add(edge.idx);
    }
  }

  areConnected(src: number, dst: number): boolean {
    const srcNode = this.nodeMap.get(src);
    const dstNode = this.nodeMap.get(dst);
    if (!srcNode || !dstNode) {
      return false;
    }
    for (const edgeId of srcNode.outEdges) {
      const edge = this.edgesMap.get(edgeId);
      if (edge && edge.dst === dst) {
        return true;
      }
    }
    return false;
  }

  exportToDOT(): string {
    let dot = "digraph CallGraph {\n";
    for (const node of this.nodeMap.values()) {
      dot += `  "${node.name}" [label="${node.name}"];\n`;
    }
    for (const edge of this.edgesMap.values()) {
      const srcNode = this.nodeMap.get(edge.src);
      const dstNode = this.nodeMap.get(edge.dst);
      if (srcNode && dstNode) {
        dot += `  "${srcNode.name}" -> "${dstNode.name}" [label="${edge.idx}"];\n`;
      } else {
        console.warn(`Missing node for edge: ${edge.src} -> ${edge.dst}`);
      }
    }
    dot += "}";
    return dot;
  }
}
