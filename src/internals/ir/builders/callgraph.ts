import { MistiContext } from "../../context";
import { Logger } from "../../logger";
import {
  BUILDER_MUTATING_METHODS,
  forEachExpression,
  foldExpressions,
  isSelf,
  MAP_MUTATING_METHODS,
  STRING_MUTATING_METHODS,
  getMethodCallsChain,
  DATETIME_FUNCTIONS,
  PRG_SAFE_USE_FUNCTIONS,
  PRG_NATIVE_USE_FUNCTIONS,
  PRG_INIT_FUNCTIONS,
  isSendCall,
} from "../../tact/";
import { unreachable } from "../../util";
import { AstStore } from "../astStore";
import {
  CallGraph,
  CGEdge,
  CGEdgeId,
  CGNode,
  CGNodeId,
  Effect,
} from "../callGraph";
import {
  AstAsmFunctionDef,
  AstContractDeclaration,
  AstContractInit,
  AstExpression,
  AstFunctionDef,
  AstMethodCall,
  AstNode,
  AstReceiver,
  AstStatement,
  AstTraitDeclaration,
  idText,
  isSelfId,
  tryExtractPath,
} from "@tact-lang/compiler/dist/grammar/ast";

type SupportedFunDefs =
  | AstFunctionDef
  | AstReceiver
  | AstContractInit
  | AstAsmFunctionDef;

export class TactCallGraphBuilder {
  private nodeMap: Map<CGNodeId, CGNode> = new Map();
  private astIdToNodeId: Map<AstNode["id"], CGNodeId> = new Map();
  private nameToNodeId: Map<string, CGNodeId> = new Map();
  private edgesMap: Map<CGEdgeId, CGEdge> = new Map();
  private readonly logger: Logger;

  private constructor(
    ctx: MistiContext,
    private readonly astStore: AstStore,
  ) {
    this.logger = ctx.logger;
  }

  static make(ctx: MistiContext, astStore: AstStore): TactCallGraphBuilder {
    return new TactCallGraphBuilder(ctx, astStore);
  }

  /**
   * Builds the call graph using data from the AST store.
   * @returns The constructed `CallGraph`.
   */
  public build(): CallGraph {
    this.astStore
      .getProgramEntries({ includeStdlib: true })
      .forEach((entry) => {
        if (entry.kind === "contract" || entry.kind === "trait") {
          const contract = entry;
          const contractName = contract.name.text;
          contract.declarations.forEach((decl) => {
            this.addContractDeclarationToGraph(decl, contractName);
          });
        } else if (entry.kind === "function_def") {
          const func = entry;
          this.addFunctionToGraph(func);
        }
      });
    this.analyzeFunctionCalls();
    return new CallGraph(
      this.nodeMap,
      this.astIdToNodeId,
      this.nameToNodeId,
      this.edgesMap,
    );
  }

  /**
   * Adds a contract declaration (function, receiver, or initializer) to the graph.
   * @param declaration The declaration to add.
   * @param contractName The name of the contract the declaration belongs to.
   */
  private addContractDeclarationToGraph(
    declaration: AstContractDeclaration | AstTraitDeclaration,
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
   * @returns Fully qualified function name.
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
   */
  private analyzeFunctionCalls() {
    for (const entry of this.astStore.getProgramEntries()) {
      if (entry.kind === "contract" || entry.kind === "trait") {
        for (const declaration of entry.declarations) {
          if (
            declaration.kind === "function_def" ||
            declaration.kind === "contract_init" ||
            declaration.kind === "receiver"
          ) {
            const func = declaration;
            const funcNodeId = this.astIdToNodeId.get(func.id);
            if (funcNodeId !== undefined) {
              const funcNode = this.nodeMap.get(funcNodeId);
              if (!funcNode) continue;
              func.statements.forEach((stmt) => {
                this.processStatement(stmt, funcNodeId, idText(entry.name));
              });
            }
          }
        }
      } else if (entry.kind === "function_def") {
        const func = entry;
        const funcNodeId = this.astIdToNodeId.get(func.id);
        if (funcNodeId !== undefined) {
          const funcNode = this.nodeMap.get(funcNodeId);
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
    const funcNode = this.nodeMap.get(callerId);
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
   * Processes calls in expressions building the CG.
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
      const functionName = CallGraph.getFunctionCallName(
        expr,
        currentContractName,
        this.astStore,
      );
      if (functionName) {
        const calleeId = this.findOrAddFunction(functionName);
        this.addEdge(callerId, calleeId);
      }
    }

    // Add effects to the caller node
    const funcNode = this.nodeMap.get(callerId);
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
