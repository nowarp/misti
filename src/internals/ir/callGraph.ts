import { unreachable } from "../util";
import { TactASTStore } from "./astStore";
import { IdxGenerator } from "./indices";
import { MistiContext } from "../../";
import { Logger } from "../../internals/logger";
import { forEachExpression } from "../tact/iterators";
import { isSendCall } from "../tact/util";
import {
  AstFunctionDef,
  AstReceiver,
  AstContractInit,
  AstExpression,
  AstMethodCall,
  AstStaticCall,
  AstContract,
  AstId,
  AstContractDeclaration,
  AstNode,
  AstFieldAccess,
  AstStatement,
  AstStatementAssign,
  AstStatementAugmentedAssign,
  AstStatementExpression,
} from "@tact-lang/compiler/dist/grammar/ast";

export type CGNodeId = number & { readonly brand: unique symbol };
export type CGEdgeId = number & { readonly brand: unique symbol };

/**
 * Effect flags for CGNode.
 *
 * Each flag represents an effect or property of the function represented by the node.
 */
export enum EffectFlags {
  CALLS_SEND = 1 << 0,
  CONTRACT_STATE_READ = 1 << 1,
  CONTRACT_STATE_WRITE = 1 << 2,
  ACCESSES_DATETIME = 1 << 3,
  RANDOMNESS_USE = 1 << 4,
  RANDOMNESS_SEED_INITIALIZATION = 1 << 5,
}

/**
 * Represents an edge in the call graph, indicating a call from one function to another.
 */
class CGEdge {
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

/**
 * Represents a node in the call graph, corresponding to a function or method.
 */
class CGNode {
  public idx: CGNodeId;
  public inEdges: Set<CGEdgeId> = new Set();
  public outEdges: Set<CGEdgeId> = new Set();
  public effects: number = 0;

  /**
   * @param astId The AST ID of the function or method this node represents (can be `undefined` for synthetic nodes)
   * @param name The name of the function or method
   * @param logger A logger instance for logging messages
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

  public addEffect(effect: EffectFlags) {
    this.effects |= effect;
  }

  public hasEffect(effect: EffectFlags): boolean {
    return (this.effects & effect) !== 0;
  }
}

/**
 * Represents the call graph, a directed graph where nodes represent functions or methods,
 * and edges indicate calls between them.
 */
export class CallGraph {
  private nodeMap: Map<CGNodeId, CGNode> = new Map();
  private astIdToNodeId: Map<AstNode["id"], CGNodeId> = new Map();
  private nameToNodeId: Map<string, CGNodeId> = new Map();
  private edgesMap: Map<CGEdgeId, CGEdge> = new Map();
  private logger: Logger;

  /**
   * @param ctx The MistiContext providing a logger and other utilities
   */
  constructor(private ctx: MistiContext) {
    this.logger = ctx.logger;
  }

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
   * Retrieves a node's ID by its AST ID.
   * @param astId The AST ID of the function.
   * @returns The corresponding node ID, or `undefined` if not found.
   */
  public getNodeIdByAstId(astId: number): CGNodeId | undefined {
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
   * Builds the call graph using data from the AST store.
   * @param astStore The AST store containing program entries.
   * @returns The constructed `CallGraph`.
   */
  public build(astStore: TactASTStore): CallGraph {
    for (const entry of astStore.getProgramEntries()) {
      if (entry.kind === "contract") {
        const contract = entry as AstContract;
        const contractName = contract.name.text;
        for (const declaration of contract.declarations) {
          this.addContractDeclarationToGraph(declaration, contractName);
        }
      } else if (entry.kind === "function_def") {
        const func = entry as AstFunctionDef;
        this.addFunctionToGraph(func);
      }
    }
    this.analyzeFunctionCalls(astStore);
    return this;
  }

  /**
   * Adds a contract declaration (function, receiver, or initializer) to the graph.
   * @param declaration The declaration to add.
   * @param contractName The name of the contract the declaration belongs to.
   */
  private addContractDeclarationToGraph(
    declaration: AstContractDeclaration,
    contractName: string,
  ) {
    if (declaration.kind === "function_def") {
      this.addFunctionToGraph(declaration as AstFunctionDef, contractName);
    } else if (declaration.kind === "contract_init") {
      this.addFunctionToGraph(declaration as AstContractInit, contractName);
    } else if (declaration.kind === "receiver") {
      this.addFunctionToGraph(declaration as AstReceiver, contractName);
    }
  }

  /**
   * Adds a function node to the graph.
   * @param func The function definition, receiver, or initializer.
   * @param contractName The optional contract name for namespacing.
   */
  private addFunctionToGraph(
    func: AstFunctionDef | AstReceiver | AstContractInit,
    contractName?: string,
  ) {
    const funcName = this.getFunctionName(func, contractName);
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

  /**
   * Extracts the function name based on its type and optional contract name.
   * @param func The function definition, receiver, or initializer.
   * @param contractName The optional contract name.
   * @returns The function name, or `undefined` if it cannot be determined.
   */
  private getFunctionName(
    func: AstFunctionDef | AstReceiver | AstContractInit,
    contractName?: string,
  ): string | undefined {
    switch (func.kind) {
      case "function_def":
        return contractName
          ? `${contractName}::${func.name?.text}`
          : func.name?.text;
      case "contract_init":
        return contractName
          ? `${contractName}::contract_init_${func.id}`
          : `contract_init_${func.id}`;
      case "receiver":
        return contractName
          ? `${contractName}::receiver_${func.id}`
          : `receiver_${func.id}`;
      default:
        unreachable(func);
    }
  }

  /**
   * Analyzes the AST for function calls and adds edges between caller and callee nodes.
   * Additionally, sets flags on nodes based on their properties (e.g., if they call 'send').
   * @param astStore The AST store to analyze.
   */
  private analyzeFunctionCalls(astStore: TactASTStore) {
    for (const entry of astStore.getProgramEntries()) {
      if (entry.kind === "contract") {
        const contract = entry as AstContract;
        const contractName = contract.name.text;
        for (const declaration of contract.declarations) {
          if (
            declaration.kind === "function_def" ||
            declaration.kind === "contract_init" ||
            declaration.kind === "receiver"
          ) {
            const func = declaration as
              | AstFunctionDef
              | AstContractInit
              | AstReceiver;
            const funcNodeId = this.astIdToNodeId.get(func.id);
            if (funcNodeId !== undefined) {
              const funcNode = this.getNode(funcNodeId);
              if (!funcNode) continue;

              if ("statements" in func && func.statements) {
                for (const stmt of func.statements) {
                  this.processStatement(stmt, funcNodeId, contractName);
                }
              }

              forEachExpression(func, (expr) => {
                this.processExpression(expr, funcNodeId, contractName);
              });
            }
          }
        }
      } else if (entry.kind === "function_def") {
        const func = entry as AstFunctionDef;
        const funcNodeId = this.astIdToNodeId.get(func.id);
        if (funcNodeId !== undefined) {
          const funcNode = this.getNode(funcNodeId);
          if (!funcNode) continue;
          if (func.statements) {
            for (const stmt of func.statements) {
              this.processStatement(stmt, funcNodeId);
            }
          }
          forEachExpression(func, (expr) => {
            this.processExpression(expr, funcNodeId);
          });
        }
      }
    }
  }

  /**
   * Processes a single statement, identifying assignments and other statements.
   * Also detects effects and sets corresponding flags on the function node.
   * @param stmt The statement to process.
   * @param callerId The node ID of the calling function.
   * @param currentContractName The name of the contract, if applicable.
   */
  private processStatement(
    stmt: AstStatement,
    callerId: CGNodeId,
    currentContractName?: string,
  ) {
    const funcNode = this.getNode(callerId);
    if (!funcNode) {
      return;
    }
    if (
      stmt.kind === "statement_assign" ||
      stmt.kind === "statement_augmentedassign"
    ) {
      if (isContractStateWrite(stmt)) {
        funcNode.addEffect(EffectFlags.CONTRACT_STATE_WRITE);
      }
    } else if (stmt.kind === "statement_expression") {
      const stmtExpr = stmt as AstStatementExpression;
      this.processExpression(
        stmtExpr.expression,
        callerId,
        currentContractName,
      );
    }
  }

  /**
   * Processes an expression, adding edges and setting effect flags as necessary.
   * @param expr The expression to process.
   * @param callerId The node ID of the calling function.
   * @param currentContractName The name of the contract, if applicable.
   */
  private processExpression(
    expr: AstExpression,
    callerId: CGNodeId,
    currentContractName?: string,
  ) {
    if (expr.kind === "static_call" || expr.kind === "method_call") {
      const functionName = this.getFunctionCallName(
        expr as AstStaticCall | AstMethodCall,
        currentContractName,
      );
      if (functionName) {
        const calleeId = this.findOrAddFunction(functionName);
        this.addEdge(callerId, calleeId);
      } else {
        this.logger.warn(
          `Call expression missing function name at caller ${callerId}`,
        );
      }
    }

    const funcNode = this.getNode(callerId);
    if (!funcNode) {
      return;
    }
    if (isContractStateRead(expr)) {
      funcNode.addEffect(EffectFlags.CONTRACT_STATE_READ);
    }
    if (accessesDatetime(expr)) {
      funcNode.addEffect(EffectFlags.ACCESSES_DATETIME);
    }
    if (isRandomnessUseCall(expr)) {
      funcNode.addEffect(EffectFlags.RANDOMNESS_USE);
    }
    if (isRandomnessSeedInitializationCall(expr)) {
      funcNode.addEffect(EffectFlags.RANDOMNESS_SEED_INITIALIZATION);
    }
    if (isSendCall(expr)) {
      funcNode.addEffect(EffectFlags.CALLS_SEND);
    }
  }

  /**
   * Derives the function call name from a static or method call expression.
   * @param expr The call expression.
   * @param currentContractName The name of the current contract, if available.
   * @returns The fully qualified function name, or `undefined` if it cannot be determined.
   */
  public getFunctionCallName(
    expr: AstStaticCall | AstMethodCall,
    currentContractName?: string,
  ): string | undefined {
    if (expr.kind === "static_call") {
      return expr.function?.text;
    } else if (expr.kind === "method_call") {
      const methodName = expr.method?.text;
      if (methodName) {
        let contractName = currentContractName;
        if (expr.self.kind === "id") {
          const idExpr = expr.self as AstId;
          if (idExpr.text !== "self") {
            contractName = idExpr.text;
          }
        }
        return contractName ? `${contractName}::${methodName}` : methodName;
      }
    }
    return undefined;
  }

  /**
   * Finds or creates a function node in the graph by its name.
   * @param name The name of the function.
   * @returns The node ID of the existing or newly created function.
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
   * Adds a directed edge between two nodes in the call graph.
   * @param src The source node ID.
   * @param dst The destination node ID.
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

/**
 * Helper function to check if an expression represents 'self'.
 * @param expr The expression to check.
 * @returns True if the expression is 'self'; otherwise, false.
 */
export function isSelf(expr: AstExpression): boolean {
  return expr.kind === "id" && (expr as AstId).text === "self";
}

/**
 * Helper function to determine if an expression is a contract state read.
 * @param expr The expression to check.
 * @returns True if the expression reads from a state variable; otherwise, false.
 */
function isContractStateRead(expr: AstExpression): boolean {
  if (expr.kind === "field_access") {
    const fieldAccess = expr as AstFieldAccess;
    if (fieldAccess.aggregate.kind === "id") {
      const idExpr = fieldAccess.aggregate as AstId;
      if (idExpr.text === "self") {
        return true;
      }
    }
  }
  return false;
}

/**
 * Helper function to determine if a statement is a contract state write.
 * @param stmt The statement to check.
 * @returns True if the statement writes to a state variable; otherwise, false.
 */
function isContractStateWrite(
  stmt: AstStatementAssign | AstStatementAugmentedAssign,
): boolean {
  const pathExpr = stmt.path;
  if (pathExpr.kind === "field_access") {
    const fieldAccess = pathExpr as AstFieldAccess;
    if (fieldAccess.aggregate.kind === "id") {
      const idExpr = fieldAccess.aggregate as AstId;
      if (idExpr.text === "self") {
        return true;
      }
    }
  }
  // Note: This function does not currently detect state writes via method calls on state variables (e.g., Map.set()).
  // Handling such cases may require more advanced analysis involving the symbol table or data flow analysis.
  return false;
}

/**
 * Helper function to determine if an expression accesses the blockchain datetime.
 * @param expr The expression to check.
 * @returns True if the expression accesses datetime; otherwise, false.
 */
function accessesDatetime(expr: AstExpression): boolean {
  if (expr.kind === "static_call") {
    const staticCall = expr as AstStaticCall;
    const functionName = staticCall.function?.text;
    return functionName === "now" || functionName === "timestamp";
  }
  return false;
}

/**
 * Helper function to determine if an expression is a randomness use call.
 * @param expr The expression to check.
 * @returns True if the expression uses randomness; otherwise, false.
 */
function isRandomnessUseCall(expr: AstExpression): boolean {
  if (expr.kind === "static_call") {
    const staticCall = expr as AstStaticCall;
    const functionName = staticCall.function?.text;
    const prgUseNames = new Set(["nativeRandom", "nativeRandomInterval"]);
    return prgUseNames.has(functionName || "");
  }
  return false;
}

/**
 * Helper function to determine if an expression is a randomness seed initialization call.
 * @param expr The expression to check.
 * @returns True if the expression initializes the randomness seed; otherwise, false.
 */
function isRandomnessSeedInitializationCall(expr: AstExpression): boolean {
  if (expr.kind === "static_call") {
    const staticCall = expr as AstStaticCall;
    const functionName = staticCall.function?.text;
    const prgSeedNames = new Set(["setPrgSeed"]);
    return prgSeedNames.has(functionName || "");
  }
  return false;
}
