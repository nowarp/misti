import {
  ASTStatement,
  ASTRef,
  ASTConstant,
  ASTFunction,
  ASTExpression,
  ASTNativeFunction,
  ASTReceive,
  ASTInitFunction,
  ASTContract,
  ASTPrimitive,
  ASTField,
  ASTStruct,
  ASTTrait,
  ASTType,
} from "@tact-lang/compiler/dist/grammar/ast";

import { MistiContext } from "./context";
import { CompilerContext } from "@tact-lang/compiler/dist/context";
import { getRawAST } from "@tact-lang/compiler/dist/grammar/store";
import { createNodeFileSystem } from "@tact-lang/compiler/dist/vfs/createNodeFileSystem";
import { precompile } from "@tact-lang/compiler/dist/pipeline/precompile";
import {
  Config as TactConfig,
  parseConfig,
} from "@tact-lang/compiler/dist/config/parseConfig";
import path from "path";
import fs from "fs";

import {
  ProjectName,
  CompilationUnit,
  FunctionKind,
  TactASTStore,
  NodeIdx,
  ContractName,
  Edge,
  CFGIdx,
  ContractIdx,
  NodeKind,
  Node,
  FunctionName,
  CFG,
  Contract,
} from "./ir";

// Imported from Tact sources.
export type TactAST = {
  sources: { code: string; path: string }[];
  funcSources: { code: string; path: string }[];
  functions: (ASTFunction | ASTNativeFunction)[];
  constants: ASTConstant[];
  types: ASTType[];
};

/**
 * Generates a unique name used to identify receive functions in CFG.
 */
function generateReceiveName(receive: ASTReceive): string {
  switch (receive.selector.kind) {
    case "internal-simple":
      return `receive_internal_simple_${receive.id}`;
    case "internal-fallback":
      return `receive_internal_fallback_${receive.id}`;
    case "internal-comment":
      return `receive_internal_comment_${receive.id}_${receive.selector.comment.value}`;
    case "bounce":
      return `receive_bounce_${receive.id}`;
    case "external-simple":
      return `receive_external_simple_${receive.id}`;
    case "external-fallback":
      return `receive_external_fallback_${receive.id}`;
    case "external-comment":
      return `receive_external_comment_${receive.id}_${receive.selector.comment.value}`;
    default:
      throw new Error("Unsupported receive selector type");
  }
}

/**
 * Transforms the TactAST imported from the tact compiler to a representation more suitable for analysis.
 */
export class ASTMapper {
  private functions = new Map<
    number,
    ASTFunction | ASTReceive | ASTInitFunction
  >();
  private constants = new Map<number, ASTConstant>();
  private contracts = new Map<number, ASTContract>();
  private nativeFunctions = new Map<number, ASTNativeFunction>();
  private primitives = new Map<number, ASTPrimitive>();
  private structs = new Map<number, ASTStruct>();
  private traits = new Map<number, ASTTrait>();
  private statements = new Map<number, ASTStatement>();

  constructor(private ast: TactAST) {
    this.ast.functions.forEach((func) => {
      if (func.kind == "def_function") {
        this.processFunction(func);
      } else {
        this.nativeFunctions.set(func.id, func);
      }
    });
    this.ast.constants.forEach((constant) =>
      this.constants.set(constant.id, constant),
    );
    this.ast.types.forEach((type) => this.processType(type));
  }

  public getASTStore(): TactASTStore {
    return new TactASTStore(
      this.functions,
      this.constants,
      this.contracts,
      this.nativeFunctions,
      this.primitives,
      this.structs,
      this.traits,
      this.statements,
    );
  }

  private processType(type: ASTType): void {
    switch (type.kind) {
      case "primitive":
        this.primitives.set(type.id, type);
        break;
      case "def_struct":
        this.structs.set(type.id, type);
        break;
      case "def_trait":
        this.traits.set(type.id, type);
        break;
      case "def_contract":
        this.processContract(type);
        break;
      default:
        throw new Error(`Unsupported ASTType: ${type}`);
    }
  }

  private processContract(contract: ASTContract): void {
    this.contracts.set(contract.id, contract);
    for (const decl of contract.declarations) {
      switch (decl.kind) {
        case "def_field":
          // Do nothing, as they are accessible through contract definitions
          break;
        case "def_function":
        case "def_init_function":
        case "def_receive":
          this.processFunction(decl);
          break;
        case "def_constant":
          this.constants.set(decl.id, decl);
          break;
        default:
          throw new Error(`Unsupported contract declaration: ${decl}`);
      }
    }
  }

  private processFunction(
    func: ASTFunction | ASTInitFunction | ASTReceive,
  ): void {
    this.functions.set(func.id, func);
    func.statements?.forEach((stmt) => this.processStmt(stmt));
  }

  private processStmt(stmt: ASTStatement): void {
    this.statements.set(stmt.id, stmt);
    switch (stmt.kind) {
      case "statement_let":
        break;
      case "statement_return":
        break;
      case "statement_expression":
        break;
      case "statement_assign":
      case "statement_augmentedassign":
        break;
      case "statement_condition":
        stmt.trueStatements.forEach((s) => this.processStmt(s));
        stmt.falseStatements?.forEach((s) => this.processStmt(s));
        if (stmt.elseif) {
          this.processStmt(stmt.elseif);
        }
        break;
      case "statement_while":
      case "statement_until":
        stmt.statements.forEach((s) => this.processStmt(s));
        break;
      case "statement_repeat":
        stmt.statements.forEach((s) => this.processStmt(s));
        break;
      default:
        throw new Error(`Unsupported statement type: ${stmt}`);
    }
  }
}

/**
 * Maps each function name to its corresponding CFG index.
 */
type FunctionsMap = Map<FunctionName, CFGIdx>;

/**
 * Maps each contract name to a map of its methods, where each method is mapped to its CFG index.
 */
type MethodsMap = Map<ContractName, FunctionsMap>;

/**
 * Represents a stateful object which is responsible for constructing the IR of a single Tact project.
 * Currently, it creates a one-statement-per-basic-block CFG.
 */
export class TactIRBuilder {
  /**
   * Keeps unique identifiers registered for building CFG nodes for free functions.
   */
  private functionIndexes: FunctionsMap = new Map();

  /**
   * Keeps unique identifiers registered for building CFG nodes for contract methods.
   */
  private methodIndexes: MethodsMap = new Map();

  /**
   * Creates an instance of TactIRBuilder.
   * @param ctx: Misti context.
   * @param tactConfigPath The path to the Tact configuration file.
   * @param projectName The name of the project being compiled and analyzed, used for referencing within the compilation environment.
   * @param ast The AST of the project.
   */
  constructor(
    private ctx: MistiContext,
    private projectName: ProjectName,
    private ast: TactAST,
  ) {
    this.registerFunctions();
    this.registerContracts();
  }

  /**
   * Transforms an AST into a CompilationUnit object iterating over all function and contract definitions
   * to generate CFG for each function and method.
   * @param projectName The name of the project for which the compilation unit is being created.
   * @param ast The AST representing the parsed source code of the project.
   */
  build(): CompilationUnit {
    const functions = this.createFunctions();
    const contracts = this.createContracts();
    return new CompilationUnit(
      this.projectName,
      new ASTMapper(this.ast).getASTStore(),
      functions,
      contracts,
    );
  }

  /**
   * Assign the unique identifiers to CFG structures to refer to them in function calls later.
   */
  private registerFunctions(): void {
    this.functionIndexes = this.ast.functions.reduce((acc, fun) => {
      if (fun.kind == "def_function") {
        const idx = this.registerCFGIdx(
          fun.name,
          "function",
          fun.origin,
          fun.ref,
        );
        acc.set(fun.name, idx);
      }
      return acc;
    }, new Map<FunctionName, CFGIdx>());
  }

  /**
   * Creates CFGs for each free function defined in the AST using their previously registered unique identifiers.
   * @returns A map of CFG structures keyed by their unique identifiers, representing each free function's CFG.
   */
  private createFunctions(): Map<CFGIdx, CFG> {
    return this.ast.functions.reduce((acc, fun) => {
      if (fun.kind == "def_function") {
        const name = fun.name;
        const idx = this.functionIndexes.get(fun.name)!;
        acc.set(
          idx,
          this.createCFGFromStatements(
            idx,
            name,
            "function",
            fun.origin,
            fun.statements,
            fun.ref,
          ),
        );
      }
      return acc;
    }, new Map<CFGIdx, CFG>());
  }

  /**
   * Extracts information from the contract AST entry if it is a method.
   */
  private getMethodInfo(
    decl: ASTField | ASTFunction | ASTInitFunction | ASTReceive | ASTConstant,
  ): [string | undefined, FunctionKind | undefined, ASTStatement[] | null] {
    return decl.kind === "def_function"
      ? [decl.name, "method", decl.statements]
      : decl.kind === "def_init_function"
        ? ["init", "method", decl.statements]
        : decl.kind === "def_receive"
          ? [generateReceiveName(decl), "receive", decl.statements]
          : [undefined, undefined, null];
  }

  /**
   * Assign the unique identifiers to CFG structures to refer to them in function calls later.
   */
  private registerContracts(): void {
    this.methodIndexes = this.ast.types.reduce((acc, entry) => {
      if (entry.kind == "def_contract") {
        const contractName = entry.name;
        const methodsMap = entry.declarations.reduce((methodAcc, decl) => {
          const [name, kind, _] = this.getMethodInfo(decl);
          if (kind && name) {
            const idx = this.registerCFGIdx(name, kind, entry.origin, decl.ref);
            methodAcc.set(name, idx);
          }
          return methodAcc;
        }, new Map<FunctionName, CFGIdx>());
        acc.set(contractName, methodsMap);
      }
      return acc;
    }, new Map<ContractName, Map<FunctionName, CFGIdx>>());
  }

  /**
   * Creates the complete CFGs for contract entries using the previously registred CFG identifiers.
   */
  private createContracts(): Map<ContractIdx, Contract> {
    return this.ast.types.reduce((acc, entry) => {
      if (entry.kind == "def_contract") {
        const contractName = entry.name;
        const methodsMap = this.methodIndexes.get(contractName)!;
        const methodCFGs = entry.declarations.reduce((methodAcc, decl) => {
          const [name, kind, stmts] = this.getMethodInfo(decl);
          if (kind && name) {
            const idx = methodsMap.get(name)!;
            methodAcc.set(
              idx,
              this.createCFGFromStatements(
                idx,
                name,
                "method",
                entry.origin,
                stmts,
                decl.ref,
              ),
            );
          }
          return methodAcc;
        }, new Map<CFGIdx, CFG>());
        const contract = new Contract(contractName, methodCFGs, entry.ref);
        acc.set(contract.idx, contract);
      }
      return acc;
    }, new Map<ContractIdx, Contract>());
  }

  /**
   * Creates an unique CFG index for the function with the given name.
   */
  private registerCFGIdx(
    name: FunctionName,
    kind: "function" | "method" | "receive",
    origin: "user" | "stdlib",
    ref: ASTRef,
  ): CFGIdx {
    return new CFG(name, kind, origin, [], [], ref).idx;
  }

  /**
   * Generates nodes and edges for the CFG based on the statements within a given function or method.
   * Each node represents a single statement, and edges represent control flow between statements.
   *
   * @param idx Unique CFG identifier created on the function registration step.
   * @param name The name of the function or method being processed.
   * @param kind Indicates whether the input represents a function or a method.
   * @param origin Indicates whether the function was defined in users code or in standard library.
   * @param statements An array of ASTStatement from the AST of the function or method.
   * @param ref AST reference to the corresponding function or method.
   * @returns A CFG instance populated with nodes and edges for the provided statements.
   */
  private createCFGFromStatements(
    idx: CFGIdx,
    name: FunctionName,
    kind: "function" | "method" | "receive",
    origin: "user" | "stdlib",
    statements: ASTStatement[] | null,
    ref: ASTRef,
  ): CFG {
    const [nodes, edges] =
      statements === null ? [[], []] : this.processStatements(statements);
    return new CFG(name, kind, origin, nodes, edges, ref, idx);
  }

  /**
   * Recursively collects function and method calls from the given expression using the registered unique indexes.
   * @param expr The AST expression from which to collect function and method calls.
   * @param parentCalls A set of CFG indexes to which the indices of found function/method calls will be added.
   * @returns A set containing CFG indexes of function and method calls within the expression.
   */
  private collectFunctionCalls(
    expr: ASTExpression,
    parentCalls: Set<CFGIdx> = new Set(),
  ): Set<CFGIdx> {
    switch (expr.kind) {
      case "op_call": // method
        if (expr.src.kind === "id") {
          const contractMethods = this.methodIndexes.get(expr.src.value);
          if (contractMethods) {
            const methodIdx = contractMethods.get(expr.name);
            if (methodIdx !== undefined) {
              parentCalls.add(methodIdx);
            } else {
              this.ctx.logger.warn(
                `Calling an unknown contract method`,
                expr.ref,
              );
            }
          } else {
            // TODO: This could be trivially implemented after introducing typed
            // AST in Tact: https://github.com/tact-lang/tact/issues/289.
            this.ctx.logger.debug(
              `Accessing an unknown contract: ${expr.src.value}`,
              expr.src.ref,
            );
          }
        } else {
          // TODO: This could be trivially implemented after introducing typed
          // AST in Tact: https://github.com/tact-lang/tact/issues/289.
          this.ctx.logger.debug(
            `Unsupported contract method access: ${expr.src.kind}`,
            expr.src.ref,
          );
        }
        expr.args.forEach((arg) => this.collectFunctionCalls(arg, parentCalls));
        this.collectFunctionCalls(expr.src, parentCalls);
        break;
      case "op_static_call": // free function
        const funcIdx = this.functionIndexes.get(expr.name);
        if (funcIdx !== undefined) {
          parentCalls.add(funcIdx);
        }
        expr.args.forEach((arg) => this.collectFunctionCalls(arg, parentCalls));
        break;
      case "op_binary":
        this.collectFunctionCalls(expr.left, parentCalls);
        this.collectFunctionCalls(expr.right, parentCalls);
        break;
      case "op_unary":
        this.collectFunctionCalls(expr.right, parentCalls);
        break;
      case "op_field":
        this.collectFunctionCalls(expr.src, parentCalls);
        break;
      case "op_new":
        expr.args.forEach((arg) =>
          this.collectFunctionCalls(arg.exp, parentCalls),
        );
        break;
      case "init_of":
        expr.args.forEach((arg) => this.collectFunctionCalls(arg, parentCalls));
        break;
      case "conditional":
        this.collectFunctionCalls(expr.condition, parentCalls);
        this.collectFunctionCalls(expr.thenBranch, parentCalls);
        this.collectFunctionCalls(expr.elseBranch, parentCalls);
        break;
      case "string":
      case "number":
      case "boolean":
      case "null":
      case "lvalue_ref":
      case "id":
        break;
      default:
        throw new Error(`Unsupported expression: ${expr}`);
    }
    return parentCalls;
  }

  /**
   * Determines kind of the basic block while creating statemenets.
   */
  getNodeKind(stmt: ASTStatement): NodeKind {
    switch (stmt.kind) {
      case "statement_return":
        return { kind: "return" };
      case "statement_let":
      case "statement_expression":
      case "statement_assign":
      case "statement_augmentedassign": {
        const callees = this.collectFunctionCalls(stmt.expression);
        if (callees.size > 0) {
          return { kind: "call", callees };
        } else {
          return { kind: "regular" };
        }
      }
      default:
        return { kind: "regular" };
    }
  }

  /**
   * Recursively processes an array of AST statements to generate nodes and edges for a CFG.
   *
   * @param statements The array of ASTStatement objects.
   * @param nodes An optional array of Node objects to which new nodes will be added.
   * @param edges An optional array of Edge objects to which new edges will be added.
   * @param parentNodeIdx An optional NodeIdx representing the index of the node from which control flow enters the current sequence of statements.
   * @returns A tuple containing the arrays of Node and Edge objects representing the CFG derived from the statements.
   */
  processStatements(
    statements: ASTStatement[],
    nodes: Node[] = [],
    edges: Edge[] = [],
    parentNodeIdx?: NodeIdx,
  ): [Node[], Edge[]] {
    let lastNodeIdx: NodeIdx | undefined = parentNodeIdx;

    statements.forEach((stmt, index) => {
      const newNode = new Node(stmt.id, this.getNodeKind(stmt));
      nodes.push(newNode);

      // For the first node, if there's a parent node, connect this node to the parent
      if (index === 0 && parentNodeIdx !== undefined) {
        const edgeToParent = new Edge(parentNodeIdx, newNode.idx);
        edges.push(edgeToParent);
        nodes
          .find((node) => node.idx === parentNodeIdx)
          ?.dstEdges.add(edgeToParent.idx);
        newNode.srcEdges.add(edgeToParent.idx);
      } else if (lastNodeIdx !== undefined) {
        // Connect this node to the last node if it's not the first or has a specific parent node
        const newEdge = new Edge(lastNodeIdx, newNode.idx);
        edges.push(newEdge);
        nodes
          .find((node) => node.idx === lastNodeIdx)
          ?.dstEdges.add(newEdge.idx);
        newNode.srcEdges.add(newEdge.idx);
      }

      // Update the lastNodeIdx to the current node's index
      lastNodeIdx = newNode.idx;

      if (
        stmt.kind == "statement_let" ||
        stmt.kind == "statement_expression" ||
        stmt.kind == "statement_assign" ||
        stmt.kind == "statement_augmentedassign"
      ) {
        // Logic for linear flow statements
      } else if (stmt.kind === "statement_condition") {
        // Branching logic for trueStatements
        const [trueNodes, trueEdges] = this.processStatements(
          stmt.trueStatements,
          nodes,
          edges,
          newNode.idx,
        );
        nodes = trueNodes;
        edges = trueEdges;

        // Connect to the next node in the main flow if it exists
        const nextNodeIdx = statements[index + 1]?.id;
        if (nextNodeIdx) {
          const edgeToNext = new Edge(newNode.idx, nextNodeIdx);
          edges.push(edgeToNext);
          newNode.dstEdges.add(edgeToNext.idx);
        }

        if (stmt.falseStatements) {
          // Branching logic for falseStatements
          const [falseNodes, falseEdges] = this.processStatements(
            stmt.falseStatements,
            nodes,
            edges,
            newNode.idx,
          );
          nodes = falseNodes;
          edges = falseEdges;

          // Connect false branch to the next node in the main flow if it exists
          if (nextNodeIdx) {
            const edgeToNextFromFalse = new Edge(newNode.idx, nextNodeIdx);
            edges.push(edgeToNextFromFalse);
            newNode.dstEdges.add(edgeToNextFromFalse.idx);
          }
        }
      } else if (
        stmt.kind == "statement_while" ||
        stmt.kind == "statement_until" ||
        stmt.kind == "statement_repeat"
      ) {
        // Create an edge from the current node (loop condition) back to the start of the loop body,
        // and from the end of the loop body back to the current node to represent the loop's cycle.
        // Also, ensure the loop connects to the next node after the loop concludes.

        // Process the statements within the loop body.
        const [loopNodes, loopEdges] = this.processStatements(
          stmt.statements,
          [],
          [],
          newNode.idx, // Pass the loop condition node as the parent node to link back to.
        );

        // Concatenate the loop nodes and edges with the main lists.
        nodes = nodes.concat(loopNodes);
        edges = edges.concat(loopEdges);

        // Create an edge from the last node in the loop back to the condition to represent the loop's cycle.
        if (loopNodes.length > 0) {
          const backEdge = new Edge(
            loopNodes[loopNodes.length - 1].idx,
            newNode.idx,
          );
          edges.push(backEdge);
          loopNodes[loopNodes.length - 1].dstEdges.add(backEdge.idx);
          newNode.srcEdges.add(backEdge.idx);
        }

        // Connect to the next node in the main flow, representing the exit from the loop.
        // This requires identifying the next statement after processing the loop.
        const nextNodeIdx = statements[index + 1]?.id;
        if (nextNodeIdx !== undefined) {
          // Delay the creation of the edge to next node until after loop processing.
          const exitEdge = new Edge(newNode.idx, nextNodeIdx);
          edges.push(exitEdge);
          newNode.dstEdges.add(exitEdge.idx);
        }

        // Prevent automatic linking to the next node, since we have already done this manually.
        lastNodeIdx = undefined;
      } else if (stmt.kind === "statement_return") {
        // No need to connect return statements to subsequent nodes
        lastNodeIdx = undefined; // This effectively ends the current flow
      } else {
        throw new Error(`Unsupported statement: ${stmt}`);
      }
    });

    return [nodes, edges];
  }
}

class TactConfigManager {
  private config: TactConfig;

  /**
   * @param ctx: Misti context.
   */
  constructor(
    private ctx: MistiContext,
    private tactConfigPath: string,
  ) {
    this.config = this.readTactConfig();
  }

  /**
   * Reads the Tact configuration file from the specified path, parses it, and returns
   * the TactConfig object.
   * @throws {Error} If the config file does not exist or cannot be parsed.
   * @returns The parsed TactConfig object.
   */
  readTactConfig(): TactConfig {
    const resolvedPath = path.resolve(this.tactConfigPath);
    let config: TactConfig;
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Unable to find config file at ${resolvedPath}`);
    }
    try {
      config = parseConfig(fs.readFileSync(resolvedPath, "utf8"));
    } catch (err) {
      throw new Error(
        `Unable to parse config file at ${resolvedPath}:\n${err}`,
      );
    }
    return config;
  }

  /**
   * Parses the projects defined in the Tact configuration file, generating an AST for each.
   * @param config The Tact configuration object.
   * @returns A mapping of project names to their corresponding ASTs.
   */
  parseTactProjects(): Map<ProjectName, TactAST> {
    const project = createNodeFileSystem(
      path.dirname(this.tactConfigPath),
      false,
    );
    // This adjustment is needed to get an actual path to stdlib distributed within the tact package.
    const distPathPrefix = __dirname.includes("/dist/") ? "../../.." : "../..";
    const stdlibPath = path.resolve(
      __dirname,
      distPathPrefix,
      "node_modules",
      "@tact-lang/compiler",
      "stdlib",
    );
    const stdlib = createNodeFileSystem(stdlibPath, false);
    return this.config.projects.reduce(
      (acc: Map<ProjectName, TactAST>, projectConfig) => {
        this.ctx.logger.debug(`Parsing project ${projectConfig.name} ...`);
        const ctx = precompile(
          new CompilerContext({ shared: {} }),
          project,
          stdlib,
          projectConfig.path,
        );
        acc.set(projectConfig.name, getRawAST(ctx));
        return acc;
      },
      new Map<ProjectName, TactAST>(),
    );
  }
}

/**
 * Creates the Intermediate Representation (IR) for projects defined in a Tact configuration file.
 * @returns A mapping of project names to their corresponding CompilationUnit objects.
 */
export function createIR(
  ctx: MistiContext,
  tactConfigPath: string,
): Map<ProjectName, CompilationUnit> {
  const configManager = new TactConfigManager(ctx, tactConfigPath);
  const astEntries: Map<ProjectName, TactAST> =
    configManager.parseTactProjects();
  return Array.from(astEntries).reduce((acc, [projectName, ast]) => {
    const irBuilder = new TactIRBuilder(ctx, projectName, ast);
    acc.set(projectName, irBuilder.build());
    return acc;
  }, new Map<ProjectName, CompilationUnit>());
}
