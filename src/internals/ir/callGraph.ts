import { unreachable } from "../util";
import { AstStore } from "./astStore";
import { IdxGenerator } from "./indices";
import { InternalException, MistiContext } from "../../";
import { Logger } from "../../internals/logger";
import {
  isSendCall,
  isSelf,
  DATETIME_FUNCTIONS,
  PRG_INIT_FUNCTIONS,
  PRG_NATIVE_USE_FUNCTIONS,
  PRG_SAFE_USE_FUNCTIONS,
  getMethodCallsChain,
  MAP_MUTATING_METHODS,
  STRING_MUTATING_METHODS,
  BUILDER_MUTATING_METHODS,
} from "../tact";
import { foldExpressions, forEachExpression } from "../tact/iterators";
import {
  AstFunctionDef,
  AstReceiver,
  AstContractInit,
  AstExpression,
  AstMethodCall,
  AstStaticCall,
  AstContractDeclaration,
  AstNode,
  AstStatement,
  idText,
  AstModule,
  AstAsmFunctionDef,
  tryExtractPath,
  isSelfId,
} from "@tact-lang/compiler/dist/grammar/ast";
import { SrcInfo } from "@tact-lang/compiler/dist/grammar/grammar";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";

export type CGNodeId = number & { readonly brand: unique symbol };
export type CGEdgeId = number & { readonly brand: unique symbol };

type SupportedFunDefs =
  | AstFunctionDef
  | AstReceiver
  | AstContractInit
  | AstAsmFunctionDef;

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
  public astId: AstNode["id"] | undefined;
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
      this.astId = node.id;
      this.loc = node.loc;
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
    const signature = prettyPrint(fun)
      .split("{")[0]
      .replace(/\s+/g, " ")
      .trim();
    return signature;
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
  private readonly logger: Logger;

  /**
   * @param ctx The MistiContext providing a logger and other utilities
   */
  constructor(ctx: MistiContext) {
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
   * Retrieves a node's ID by the AST ID of its definition.
   * @param astId The AST ID of the function definition.
   * @returns The corresponding node ID, or `undefined` if not found.
   */
  public getNodeIdByAstId(astId: AstNode["id"]): CGNodeId | undefined {
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
  public build(astStore: AstStore): CallGraph {
    astStore.getProgramEntries({ includeStdlib: true }).forEach((entry) => {
      if (entry.kind === "contract") {
        const contract = entry;
        const contractName = contract.name.text;
        contract.declarations.forEach((declaration) => {
          this.addContractDeclarationToGraph(declaration, contractName);
        });
      } else if (entry.kind === "function_def") {
        const func = entry;
        this.addFunctionToGraph(func);
      }
    });
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
    switch (declaration.kind) {
      case "asm_function_def":
      case "function_def":
      case "contract_init":
      case "receiver":
        this.addFunctionToGraph(declaration, contractName);
      default:
        break; // do nothing
    }
  }

  /**
   * Adds a function node to the graph.
   * @param contractName The optional contract name for namespacing.
   */
  private addFunctionToGraph(func: SupportedFunDefs, contractName?: string) {
    const funcName = this.getFunctionName(func, contractName);
    const node = new CGNode(func, funcName, this.logger);
    this.nodeMap.set(node.idx, node);
    this.nameToNodeId.set(funcName, node.idx);
    this.astIdToNodeId.set(func.id, node.idx);
  }

  /**
   * Extracts the function name based on its type and optional contract name.
   * @param contractName The optional contract name.
   * @returns The function name, or `undefined` if it cannot be determined.
   */
  private getFunctionName(
    func: SupportedFunDefs,
    contractName?: string,
  ): string | never {
    switch (func.kind) {
      case "asm_function_def":
        return contractName
          ? `asm_${contractName}::${func.name.text}`
          : `asm_${func.name.text}`;
      case "function_def":
        return contractName
          ? `${contractName}::${func.name.text}`
          : func.name.text;
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
  private analyzeFunctionCalls(astStore: AstStore) {
    for (const entry of astStore.getProgramEntries()) {
      if (entry.kind === "contract") {
        const contract = entry;
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
              func.statements.forEach((stmt) => {
                this.processStatement(stmt, funcNodeId);
              });
            }
          }
        }
      } else if (entry.kind === "function_def") {
        const func = entry;
        const funcNodeId = this.astIdToNodeId.get(func.id);
        if (funcNodeId !== undefined) {
          const funcNode = this.getNode(funcNodeId);
          if (!funcNode) continue;
          func.statements.forEach((stmt) => {
            this.processStatement(stmt, funcNodeId);
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
   * @param contractName Name of the processed contract, if applicable.
   */
  private processStatement(
    stmt: AstStatement,
    callerId: CGNodeId,
    contractName?: string,
  ) {
    const funcNode = this.getNode(callerId);
    if (!funcNode) return;
    const modifiedFields = findStateWriteNames(stmt);
    if (modifiedFields !== undefined) {
      funcNode.addEffect(Effect.StateWrite, modifiedFields);
    }
    if (
      stmt.kind === "statement_assign" ||
      stmt.kind === "statement_augmentedassign"
    ) {
      this.processExpression(stmt.expression, callerId, contractName);
    } else
      forEachExpression(stmt, (expr) => {
        this.processExpression(expr, callerId, contractName);
      });
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
    // Connect CG nodes
    if (expr.kind === "static_call" || expr.kind === "method_call") {
      const functionName = this.getFunctionCallName(expr, currentContractName);
      if (functionName) {
        const calleeId = this.findOrAddFunction(functionName);
        this.addEdge(callerId, calleeId);
      } else {
        this.logger.warn(
          `Call expression missing function name at caller ${callerId}`,
        );
      }
    }

    // Add effects to the caller node
    const funcNode = this.getNode(callerId);
    if (!funcNode) return;
    if (expr.kind === "static_call") {
      const functionName = idText(expr.function);
      if (DATETIME_FUNCTIONS.has(functionName))
        funcNode.addEffect(Effect.AccessDatetime);
      else if (
        PRG_NATIVE_USE_FUNCTIONS.has(functionName) ||
        PRG_SAFE_USE_FUNCTIONS.has(functionName)
      )
        funcNode.addEffect(Effect.PrgUse);
      else if (PRG_INIT_FUNCTIONS.has(functionName))
        funcNode.addEffect(Effect.PrgSeedInit);
    }
    if (isSendCall(expr)) funcNode.addEffect(Effect.Send);
    const readFieldName = findFieldName(expr);
    if (readFieldName !== undefined) {
      funcNode.addEffect(Effect.StateRead, [readFieldName]);
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
      return expr.function.text;
    } else if (expr.kind === "method_call") {
      const methodName = expr.method?.text;
      if (methodName) {
        let contractName = currentContractName;
        if (expr.self.kind === "id") {
          const idExpr = expr.self;
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
 * Returns name of the field if `expr` represents its read access e.g.:
 * - `self.<field>`
 * - `self.<field_struct>.<whatever_field_access>`
 *
 * It is called from a recursive AST iterator, thus, we don't have to implement
 * recursion inside.
 */
function findFieldName(expr: AstExpression): string | undefined {
  if (expr.kind === "field_access") {
    const path = tryExtractPath(expr);
    return path !== null && path.length > 1 && isSelfId(path[0])
      ? idText(path[1])
      : undefined;
  }
  return undefined;
}

function isMutatingMethod(method: string): boolean {
  return (
    MAP_MUTATING_METHODS.has(method) ||
    STRING_MUTATING_METHODS.has(method) ||
    BUILDER_MUTATING_METHODS.has(method)
  );
}

/**
 * Returns name of the field from patterns like:
 * - `self.<field>.<mutating_method>()`
 * - `self.<field>.<whatever>.<mutating_method>().<whatever>`
 */
function findFieldMutatingState(expr: AstMethodCall): string | undefined {
  const chain = getMethodCallsChain(expr);
  return chain !== undefined &&
    chain.calls.length > 1 &&
    isSelf(chain.self) &&
    chain.calls.some((m) => isMutatingMethod(idText(m.method)))
    ? findFieldName(chain.self)
    : undefined;
}

/**
 * Returns names of fields if `expr` represents their modification.
 */
function findStateWriteNames(stmt: AstStatement): string[] | undefined {
  if (
    stmt.kind === "statement_assign" ||
    stmt.kind === "statement_augmentedassign"
  ) {
    const name = findFieldName(stmt.path);
    return name ? [name] : undefined;
  }
  const methodAccesses = foldExpressions(
    stmt,
    (acc, expr) => {
      if (expr.kind === "method_call") {
        const fieldName = findFieldMutatingState(expr);
        if (fieldName) methodAccesses.add(fieldName);
      }
      return acc;
    },
    new Set<string>(),
  );
  return methodAccesses.size !== 0 ? Array.from(methodAccesses) : undefined;
}
