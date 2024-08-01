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
import { MistiContext } from "./context";
import { TactException, InternalException } from "./exceptions";
import {
  Config as TactConfig,
  parseConfig,
} from "@tact-lang/compiler/dist/config/parseConfig";
import { CompilerContext } from "@tact-lang/compiler/dist/context";
import { getRawAST } from "@tact-lang/compiler/dist/grammar/store";
import { createNodeFileSystem } from "@tact-lang/compiler/dist/vfs/createNodeFileSystem";
import { precompile } from "@tact-lang/compiler/dist/pipeline/precompile";
import {
  AstStatement,
  SrcInfo,
  AstConstantDef,
  AstFunctionDef,
  AstExpression,
  AstTypeDecl,
  AstNativeFunctionDecl,
  AstReceiver,
  AstContractInit,
  AstContract,
  AstPrimitiveTypeDecl,
  AstFieldDecl,
  AstStructDecl,
  AstMessageDecl,
  AstTrait,
  isSelfId,
} from "@tact-lang/compiler/dist/grammar/ast";
import { AstStore } from "@tact-lang/compiler/dist/grammar/store";
import path from "path";
import fs from "fs";

/**
 * Generates a unique name used to identify receive functions in CFG.
 */
function generateReceiveName(receive: AstReceiver): string {
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
      throw InternalException.make("Unsupported receive selector type", {
        node: receive,
      });
  }
}

/**
 * A mandatory part of the file path to stdlib.
 */
const STDLIB_PATH_ELEMENTS = [
  "node_modules",
  "@tact-lang",
  "compiler",
  "stdlib",
];

/**
 * Checks if there are subdirectories present in the absolute path.
 */
function hasSubdirs(filePath: string, subdirs: string[]): boolean {
  const splitPath = filePath.split(path.sep);
  return subdirs.every((dir) => splitPath.includes(dir));
}

function definedInStdlib(loc: SrcInfo): boolean {
  return loc.file !== null && hasSubdirs(loc.file, STDLIB_PATH_ELEMENTS);
}

/**
 * Transforms the AstStore to a representation more suitable for analysis.
 */
export class AstMapper {
  private programEntries = new Set<number>();
  private stdlibIds = new Set<number>();
  private contractConstants = new Set<number>();
  private functions = new Map<
    number,
    AstFunctionDef | AstReceiver | AstContractInit
  >();
  private constants = new Map<number, AstConstantDef>();
  private contracts = new Map<number, AstContract>();
  private nativeFunctions = new Map<number, AstNativeFunctionDecl>();
  private primitives = new Map<number, AstPrimitiveTypeDecl>();
  private structs = new Map<number, AstStructDecl>();
  private messages = new Map<number, AstMessageDecl>();
  private traits = new Map<number, AstTrait>();
  private statements = new Map<number, AstStatement>();

  constructor(private ast: AstStore) {
    this.ast.functions.forEach((func) => {
      this.programEntries.add(func.id);
      if (definedInStdlib(func.loc)) {
        this.stdlibIds.add(func.id);
      }
      if (func.kind == "function_def") {
        this.processFunction(func);
      } else {
        this.nativeFunctions.set(func.id, func);
      }
    });
    this.ast.constants.forEach((constant) => {
      if (definedInStdlib(constant.loc)) {
        this.stdlibIds.add(constant.id);
      }
      this.programEntries.add(constant.id);
      this.constants.set(constant.id, constant);
    });
    this.ast.types.forEach((type) => {
      this.programEntries.add(type.id);
      this.processType(type);
    });
  }

  public getASTStore(): TactASTStore {
    return new TactASTStore(
      this.stdlibIds,
      this.contractConstants,
      this.programEntries,
      this.functions,
      this.constants,
      this.contracts,
      this.nativeFunctions,
      this.primitives,
      this.structs,
      this.messages,
      this.traits,
      this.statements,
    );
  }

  private processType(type: AstTypeDecl): void {
    switch (type.kind) {
      case "primitive_type_decl":
        this.primitives.set(type.id, type);
        break;
      case "struct_decl":
        this.structs.set(type.id, type);
        break;
      case "message_decl":
        this.messages.set(type.id, type);
        break;
      case "trait":
        this.traits.set(type.id, type);
        break;
      case "contract":
        this.processContract(type);
        break;
      default:
        throw InternalException.make("Unsupported AST type declaration", {
          node: type,
        });
    }
  }

  private processContract(contract: AstContract): void {
    this.contracts.set(contract.id, contract);
    for (const decl of contract.declarations) {
      switch (decl.kind) {
        case "field_decl":
          // Do nothing, as they are accessible through contract definitions
          break;
        case "function_def":
        case "contract_init":
        case "receiver":
          this.processFunction(decl);
          break;
        case "constant_def":
          this.constants.set(decl.id, decl);
          this.contractConstants.add(decl.id);
          break;
        default:
          throw InternalException.make("Unsupported contract declaration", {
            node: decl,
          });
      }
    }
  }

  private processFunction(
    func: AstFunctionDef | AstContractInit | AstReceiver,
  ): void {
    this.functions.set(func.id, func);
    func.statements?.forEach((stmt) => this.processStmt(stmt));
  }

  private processStmt(stmt: AstStatement): void {
    this.statements.set(stmt.id, stmt);
    switch (stmt.kind) {
      case "statement_let":
      case "statement_return":
      case "statement_expression":
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
      case "statement_repeat":
      case "statement_foreach":
        stmt.statements.forEach((s) => this.processStmt(s));
        break;
      case "statement_try":
        stmt.statements.forEach((s) => this.processStmt(s));
        break;
      case "statement_try_catch":
        stmt.statements.forEach((s) => this.processStmt(s));
        stmt.catchStatements.forEach((s) => this.processStmt(s));
        break;
      default:
        throw InternalException.make("Unsupported statement", { node: stmt });
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
   * @param projectName The name of the project being compiled and analyzed, used for referencing within the compilation environment.
   * @param ast The AST of the project.
   */
  constructor(
    private ctx: MistiContext,
    private projectName: ProjectName,
    private ast: AstStore,
  ) {
    this.registerFunctions();
    this.registerContracts();
  }

  /**
   * Transforms an AST into a CompilationUnit object iterating over all function and contract definitions
   * to generate CFG for each function and method.
   */
  build(): CompilationUnit {
    const functions = this.createFunctions();
    const contracts = this.createContracts();
    return new CompilationUnit(
      this.projectName,
      new AstMapper(this.ast).getASTStore(),
      functions,
      contracts,
    );
  }

  /**
   * Assign the unique identifiers to CFG structures to refer to them in function calls later.
   */
  private registerFunctions(): void {
    this.functionIndexes = this.ast.functions.reduce((acc, fun) => {
      if (fun.kind == "function_def") {
        const idx = this.registerCFGIdx(
          fun.name.text,
          "function",
          fun.loc.origin,
          fun.loc,
        );
        acc.set(fun.name.text, idx);
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
      if (fun.kind == "function_def") {
        const idx = this.functionIndexes.get(fun.name.text)!;
        acc.set(
          idx,
          this.createCFGFromStatements(
            idx,
            fun.name.text,
            "function",
            fun.loc.origin,
            fun.statements,
            fun.loc,
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
    decl:
      | AstFieldDecl
      | AstFunctionDef
      | AstContractInit
      | AstReceiver
      | AstConstantDef,
    contractId: number,
  ): [string | undefined, FunctionKind | undefined, AstStatement[] | null] {
    return decl.kind === "function_def"
      ? [decl.name.text, "method", decl.statements]
      : decl.kind === "contract_init"
        ? [`init_${contractId}`, "method", decl.statements]
        : decl.kind === "receiver"
          ? [generateReceiveName(decl), "receive", decl.statements]
          : [undefined, undefined, null];
  }

  /**
   * Assign the unique identifiers to CFG structures to refer to them in function calls later.
   */
  private registerContracts(): void {
    this.methodIndexes = this.ast.types.reduce((acc, entry) => {
      if (entry.kind == "contract") {
        const contractName = entry.name.text;
        const methodsMap = entry.declarations.reduce((methodAcc, decl) => {
          const [name, kind, _] = this.getMethodInfo(decl, entry.id);
          if (kind && name) {
            const idx = this.registerCFGIdx(
              name,
              kind,
              entry.loc.origin,
              decl.loc,
            );
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
   * Creates the complete CFGs for contract entries using the previously registered CFG identifiers.
   */
  private createContracts(): Map<ContractIdx, Contract> {
    return this.ast.types.reduce((acc, entry) => {
      if (entry.kind == "contract") {
        const contractName = entry.name.text;
        const methodsMap = this.methodIndexes.get(contractName)!;
        const methodCFGs = entry.declarations.reduce((methodAcc, decl) => {
          const [name, kind, stmts] = this.getMethodInfo(decl, entry.id);
          if (kind && name) {
            const idx = methodsMap.get(name)!;
            methodAcc.set(
              idx,
              this.createCFGFromStatements(
                idx,
                name,
                "method",
                entry.loc.origin,
                stmts,
                decl.loc,
              ),
            );
          }
          return methodAcc;
        }, new Map<CFGIdx, CFG>());
        const contract = new Contract(contractName, methodCFGs, entry.loc);
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
    ref: SrcInfo,
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
   * @param statements An array of AstStatement from the AST of the function or method.
   * @param ref AST reference to the corresponding function or method.
   * @returns A CFG instance populated with nodes and edges for the provided statements.
   */
  private createCFGFromStatements(
    idx: CFGIdx,
    name: FunctionName,
    kind: "function" | "method" | "receive",
    origin: "user" | "stdlib",
    statements: AstStatement[] | null,
    ref: SrcInfo,
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
    expr: AstExpression,
    parentCalls: Set<CFGIdx> = new Set(),
  ): Set<CFGIdx> {
    switch (expr.kind) {
      case "method_call": // method
        if (expr.self.kind === "id" && isSelfId(expr.self)) {
          const contractMethods = this.methodIndexes.get(expr.self.text);
          if (contractMethods) {
            const methodIdx = contractMethods.get(expr.method.text);
            if (methodIdx !== undefined) {
              parentCalls.add(methodIdx);
            } else {
              this.ctx.logger.warn(
                `Calling an unknown contract method: ${expr.method.text}`,
                expr.loc,
              );
            }
          } else {
            // TODO: This could be trivially implemented after introducing typed
            // AST in Tact: https://github.com/tact-lang/tact/issues/289.
            this.ctx.logger.debug(
              `Accessing an unknown contract: ${expr.self.text}`,
              expr.self.loc,
            );
          }
        } else {
          // TODO: This could be trivially implemented after introducing typed
          // AST in Tact: https://github.com/tact-lang/tact/issues/289.
          this.ctx.logger.debug(
            `Unsupported contract method access: ${expr.self.kind}`,
            expr.self.loc,
          );
        }
        expr.args.forEach((arg) => this.collectFunctionCalls(arg, parentCalls));
        this.collectFunctionCalls(expr.self, parentCalls);
        break;
      case "static_call": // free function
        const funcIdx = this.functionIndexes.get(expr.function.text);
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
        this.collectFunctionCalls(expr.operand, parentCalls);
        break;
      case "field_access":
        this.collectFunctionCalls(expr.aggregate, parentCalls);
        break;
      case "struct_instance":
        expr.args.forEach((arg) =>
          this.collectFunctionCalls(arg.initializer, parentCalls),
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
      case "id":
        break;
      default:
        throw InternalException.make("Unsupported expression", { node: expr });
    }
    return parentCalls;
  }

  /**
   * Determines kind of the basic block while creating statements.
   */
  getNodeKind(stmt: AstStatement): NodeKind {
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
   * @param statements The array of AstStatement objects.
   * @param nodes An optional array of Node objects to which new nodes will be added.
   * @param edges An optional array of Edge objects to which new edges will be added.
   * @param lastNodeIdxes An optional NodeIdx representing the index of the node from which control flow enters the current sequence of statements.
   * @returns A tuple containing the arrays of Node and Edge objects representing the CFG derived from the statements.
   */
  processStatements(
    statements: AstStatement[],
    nodes: Node[] = [],
    edges: Edge[] = [],
    lastNodeIdxes: NodeIdx[] = [],
  ): [Node[], Edge[]] {
    statements.forEach((stmt, _index) => {
      const newNode = new Node(stmt.id, this.getNodeKind(stmt));
      nodes.push(newNode);
      // If there's a parent node, connect this node to the parent
      if (lastNodeIdxes !== undefined) {
        lastNodeIdxes.forEach((idx) => {
          const src = this.getParent(nodes, idx);
          edges.push(this.addEdge(src, newNode));
        });
      }

      if (
        stmt.kind == "statement_let" ||
        stmt.kind == "statement_expression" ||
        stmt.kind == "statement_assign" ||
        stmt.kind == "statement_augmentedassign"
      ) {
        // Update the lastNodeIdx to the current node's index
        lastNodeIdxes = [newNode.idx];
      } else if (stmt.kind === "statement_condition") {
        // Branching logic for trueStatements
        const [trueNodes, trueEdges] = this.processStatements(
          stmt.trueStatements,
          nodes,
          edges,
          [newNode.idx],
        );
        nodes = trueNodes;
        edges = trueEdges;
        const trueEndNode = trueNodes[trueNodes.length - 1];

        if (stmt.falseStatements !== null && stmt.falseStatements.length > 0) {
          // Branching logic for falseStatements
          const [falseNodes, falseEdges] = this.processStatements(
            stmt.falseStatements,
            nodes,
            edges,
            [newNode.idx],
          );
          nodes = falseNodes;
          edges = falseEdges;
          const falseEndNode = falseNodes[falseNodes.length - 1];
          lastNodeIdxes = [trueEndNode.idx, falseEndNode.idx];
        } else {
          // Connect the end of the true branch to the next statement
          lastNodeIdxes = [trueEndNode.idx];
        }
      } else if (
        stmt.kind == "statement_while" ||
        stmt.kind == "statement_until" ||
        stmt.kind == "statement_repeat" ||
        stmt.kind == "statement_foreach"
      ) {
        // Create an edge from the current node (loop condition) back to the start of the loop body,
        // and from the end of the loop body back to the current node to represent the loop's cycle.
        // Also, ensure the loop connects to the next node after the loop concludes.

        // Process the statements within the loop body.
        const [loopNodes, loopEdges] = this.processStatements(
          stmt.statements,
          nodes,
          edges,
          [newNode.idx],
        );
        nodes = loopNodes;
        edges = loopEdges;

        // Create an edge from the last node in the loop back to the condition to represent the loop's cycle.
        if (loopNodes.length > 0) {
          const lastNode = loopNodes[loopNodes.length - 1];
          edges.push(this.addEdge(lastNode, newNode));
        }
        // Connect condition with the statement after loop.
        lastNodeIdxes = [newNode.idx];
      } else if (
        stmt.kind === "statement_try" ||
        stmt.kind === "statement_try_catch"
      ) {
        // Process the try branch.
        const [tryNodes, tryEdges] = this.processStatements(
          stmt.statements,
          nodes,
          edges,
          [newNode.idx],
        );
        nodes = tryNodes;
        edges = tryEdges;
        // Connect the last try block with statements after this `try` block or
        // with `try` itself if it is empty.
        lastNodeIdxes =
          tryNodes.length > 0
            ? [tryNodes[tryNodes.length - 1].idx]
            : [newNode.idx];

        // Handle the `catch` clause.
        if (stmt.kind === "statement_try_catch") {
          const [catchNodes, catchEdges] = this.processStatements(
            stmt.catchStatements,
            nodes,
            edges,
            [newNode.idx],
          );
          nodes = catchNodes;
          edges = catchEdges;
          // Catch block always terminates execution.
          if (catchNodes.length > 0) {
            tryNodes[tryNodes.length - 1].kind = { kind: "return" };
          }
        }
      } else if (stmt.kind === "statement_return") {
        // No need to connect return statements to subsequent nodes
        lastNodeIdxes = [];
      } else {
        throw InternalException.make("Unsupported statement", { node: stmt });
      }
    });

    return [nodes, edges];
  }

  private getParent(nodes: Node[], idx: NodeIdx): Node {
    const node = nodes.find((node) => node.idx === idx);
    if (node === undefined) {
      throw InternalException.make(
        `Cannot find node with index=${idx}. Available nodes: ${nodes.map((n) => n.idx)}`,
      );
    }
    return node;
  }

  private addEdge(src: Node, dst: Node): Edge {
    const edge = new Edge(src.idx, dst.idx);
    src.dstEdges.add(edge.idx);
    dst.srcEdges.add(edge.idx);
    return edge;
  }
}

class TactConfigManager {
  private config: TactConfig;

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
  private readTactConfig(): TactConfig {
    const resolvedPath = path.resolve(this.tactConfigPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Unable to find config file at ${resolvedPath}`);
    }
    try {
      return parseConfig(fs.readFileSync(resolvedPath, "utf8"));
    } catch (err) {
      throw new Error(
        `Unable to parse config file at ${resolvedPath}:\n${err}`,
      );
    }
  }

  /**
   * Parses the projects defined in the Tact configuration file, generating an AST for each.
   * @param config The Tact configuration object.
   * @returns A mapping of project names to their corresponding ASTs.
   */
  parseTactProjects(): Map<ProjectName, AstStore> {
    const project = createNodeFileSystem(
      path.dirname(this.tactConfigPath),
      false,
    );
    // This adjustment is needed to get an actual path to stdlib distributed within the tact package.
    const distPathPrefix = __dirname.includes("/dist/") ? "../../.." : "../..";
    const stdlibPath = path.resolve(
      __dirname,
      distPathPrefix,
      ...STDLIB_PATH_ELEMENTS,
    );
    const stdlib = createNodeFileSystem(stdlibPath, false);
    return this.config.projects.reduce(
      (acc: Map<ProjectName, AstStore>, projectConfig) => {
        this.ctx.logger.debug(`Parsing project ${projectConfig.name} ...`);
        try {
          const ctx = precompile(
            new CompilerContext({ shared: {} }),
            project,
            stdlib,
            projectConfig.path,
          );
          acc.set(projectConfig.name, getRawAST(ctx));
          return acc;
        } catch (error: unknown) {
          throw TactException.make(error);
        }
      },
      new Map<ProjectName, AstStore>(),
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
  const astEntries: Map<ProjectName, AstStore> =
    configManager.parseTactProjects();
  return Array.from(astEntries).reduce((acc, [projectName, ast]) => {
    const irBuilder = new TactIRBuilder(ctx, projectName, ast);
    acc.set(projectName, irBuilder.build());
    return acc;
  }, new Map<ProjectName, CompilationUnit>());
}
