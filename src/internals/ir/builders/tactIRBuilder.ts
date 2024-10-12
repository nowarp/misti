import {
  BasicBlock,
  BasicBlockIdx,
  BasicBlockKind,
  CFG,
  CFGIdx,
  CompilationUnit,
  Contract,
  ContractIdx,
  ContractName,
  Edge,
  FunctionKind,
  FunctionName,
  ProjectName,
  TactASTStore,
} from "..";
import { MistiContext } from "../../context";
import {
  ExecutionException,
  InternalException,
  TactException,
  throwZodError,
} from "../../exceptions";
import { formatPosition } from "../../tact";
import { unreachable } from "../../util";
import {
  ConfigProject,
  Config as TactConfig,
  parseConfig,
} from "@tact-lang/compiler/dist/config/parseConfig";
import { CompilerContext } from "@tact-lang/compiler/dist/context";
import {
  AstAsmFunctionDef,
  AstConstantDef,
  AstContract,
  AstContractDeclaration,
  AstContractInit,
  AstExpression,
  AstFunctionDef,
  AstMessageDecl,
  AstNativeFunctionDecl,
  AstPrimitiveTypeDecl,
  AstReceiver,
  AstStatement,
  AstStructDecl,
  AstTrait,
  AstTypeDecl,
  SrcInfo,
  isSelfId,
} from "@tact-lang/compiler/dist/grammar/ast";
import { getRawAST } from "@tact-lang/compiler/dist/grammar/store";
import { AstStore } from "@tact-lang/compiler/dist/grammar/store";
import { enableFeatures } from "@tact-lang/compiler/dist/pipeline/build";
import { precompile } from "@tact-lang/compiler/dist/pipeline/precompile";
import { createNodeFileSystem } from "@tact-lang/compiler/dist/vfs/createNodeFileSystem";
import fs from "fs";
import path from "path";

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
      unreachable(receive.selector);
  }
}

/**
 * A mandatory part of the file path to stdlib if using the default path.
 */
export const DEFAULT_STDLIB_PATH_ELEMENTS = [
  "node_modules",
  "@tact-lang",
  "compiler",
  "stdlib",
];

/**
 * Returns path to Tact stdlib defined in the `node_modules`.
 *
 * This adjustment is needed to get an actual path to stdlib distributed within the tact package.
 */
export function setTactStdlibPath(nodeModulesPath: string = "../../../..") {
  return path.resolve(
    __dirname,
    nodeModulesPath,
    ...DEFAULT_STDLIB_PATH_ELEMENTS,
  );
}

/**
 * Checks if there are subdirectories present in the absolute path.
 */
function hasSubdirs(filePath: string, subdirs: string[]): boolean {
  const splitPath = filePath.split(path.sep);
  return subdirs.every((dir) => splitPath.includes(dir));
}

function definedInStdlib(ctx: MistiContext, loc: SrcInfo): boolean {
  const stdlibPath = ctx.config.tactStdlibPath;
  const pathElements =
    stdlibPath === undefined
      ? DEFAULT_STDLIB_PATH_ELEMENTS
      : stdlibPath.split("/").filter((part) => part !== "");
  return loc.file !== null && hasSubdirs(loc.file, pathElements);
}

/**
 * Transforms AstStore to TactASTStore.
 */
class TactASTStoreBuilder {
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
  private asmFunctions = new Map<number, AstAsmFunctionDef>();
  private primitives = new Map<number, AstPrimitiveTypeDecl>();
  private structs = new Map<number, AstStructDecl>();
  private messages = new Map<number, AstMessageDecl>();
  private traits = new Map<number, AstTrait>();
  private statements = new Map<number, AstStatement>();

  private constructor(
    private ctx: MistiContext,
    private ast: AstStore,
  ) {
    this.processAstElements(this.ast.functions, this.processFunctionElement);
    this.processAstElements(this.ast.constants, this.processConstantElement);
    this.processAstElements(this.ast.types, this.processTypeElement);
  }
  public static make(ctx: MistiContext, ast: AstStore): TactASTStoreBuilder {
    return new TactASTStoreBuilder(ctx, ast);
  }

  private processAstElements<T extends { id: number; loc: SrcInfo }>(
    elements: T[],
    processor: (element: T) => void,
  ): void {
    elements.forEach((element) => {
      this.programEntries.add(element.id);
      if (definedInStdlib(this.ctx, element.loc)) {
        this.stdlibIds.add(element.id);
      }
      processor.call(this, element);
    });
  }

  private processFunctionElement(
    func: AstFunctionDef | AstNativeFunctionDecl | AstAsmFunctionDef,
  ): void {
    switch (func.kind) {
      case "function_def":
        this.processFunction(func);
        break;
      case "asm_function_def":
        this.asmFunctions.set(func.id, func);
        break;
      case "native_function_decl":
        this.nativeFunctions.set(func.id, func);
        break;
      default:
        unreachable(func);
    }
  }

  private processConstantElement(constant: AstConstantDef): void {
    this.constants.set(constant.id, constant);
  }

  private processTypeElement(type: AstTypeDecl): void {
    this.processType(type);
  }

  public build(): TactASTStore {
    return new TactASTStore(
      this.stdlibIds,
      this.contractConstants,
      this.programEntries,
      this.functions,
      this.constants,
      this.contracts,
      this.nativeFunctions,
      this.asmFunctions,
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
        this.processTrait(type);
        break;
      case "contract":
        this.processContract(type);
        break;
      default:
        unreachable(type);
    }
  }

  private processTrait(trait: AstTrait): void {
    this.traits.set(trait.id, trait);
    for (const decl of trait.declarations) {
      switch (decl.kind) {
        case "field_decl":
          // Do nothing, as they are accessible through trait definitions
          break;
        case "function_def":
        case "receiver":
          this.processFunction(decl);
          break;
        case "asm_function_def":
          this.asmFunctions.set(decl.id, decl);
          break;
        case "constant_def":
          this.constants.set(decl.id, decl);
          this.contractConstants.add(decl.id);
          break;
        case "constant_decl":
        case "function_decl":
          break;
        default:
          unreachable(decl);
      }
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
        case "asm_function_def":
          this.asmFunctions.set(decl.id, decl);
          break;
        case "constant_def":
          this.constants.set(decl.id, decl);
          this.contractConstants.add(decl.id);
          break;
        default:
          unreachable(decl);
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
        unreachable(stmt);
    }
  }
}

/**
 * Maps each function name to its corresponding CFG index.
 */
export type FunctionsMap = Map<FunctionName, CFGIdx>;

/**
 * Maps each contract name to a map of its methods, where each method is mapped to its CFG index.
 */
export type MethodsMap = Map<ContractName, FunctionsMap>;

/**
 * Represents a stateful object which is responsible for constructing the IR of a Tact project.
 *
 * It creates a one-statement-per-basic-block CFG.
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
   * @param projectName The name of the project being compiled and analyzed, used for referencing within the compilation environment.
   * @param ast The AST of the project.
   */
  private constructor(
    private ctx: MistiContext,
    private projectName: ProjectName,
    private ast: AstStore,
  ) {
    this.registerFunctions();
    this.registerContracts();
  }
  public static make(
    ctx: MistiContext,
    projectName: ProjectName,
    ast: AstStore,
  ): TactIRBuilder {
    return new TactIRBuilder(ctx, projectName, ast);
  }

  /**
   * Transforms an AST into a `CompilationUnit` object.
   */
  build(): CompilationUnit {
    const functions = this.createFunctions();
    const contracts = this.createContracts();
    return new CompilationUnit(
      this.projectName,
      TactASTStoreBuilder.make(this.ctx, this.ast).build(),
      functions,
      contracts,
    );
  }

  /**
   * Assign the unique CFG indices to free function definitions.
   */
  private registerFunctions(): void {
    this.functionIndexes = this.ast.functions.reduce((acc, fun) => {
      if (fun.kind == "function_def") {
        const idx = this.registerCFGIdx(
          fun.name.text,
          fun.id,
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
            fun.id,
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
    decl: AstContractDeclaration,
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
   * Assign the unique CFG indices to contract methods.
   */
  private registerContracts(): void {
    this.methodIndexes = this.ast.types.reduce((acc, entry) => {
      if (entry.kind == "contract") {
        const contractName = entry.name.text;
        const methodsMap = entry.declarations.reduce((methodAcc, decl) => {
          const [name, kind, _] = this.getMethodInfo(decl, entry.id);
          // NOTE: We don't create CFG entries for asm functions.
          if (kind && name) {
            const idx = this.registerCFGIdx(
              name,
              decl.id,
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
                decl.id,
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
    id: number,
    kind: "function" | "method" | "receive",
    origin: "user" | "stdlib",
    ref: SrcInfo,
  ): CFGIdx {
    return new CFG(name, id, kind, origin, [], [], ref).idx;
  }

  /**
   * Generates basic blocks (BB) and edges for the CFG based on the statements within a given function or method.
   * Each BB represents a single statement, and edges represent control flow between statements.
   *
   * @param idx Unique CFG identifier created on the function registration step.
   * @param name The name of the function or method being processed.
   * @param name AST ID.
   * @param kind Indicates whether the input represents a function or a method.
   * @param origin Indicates whether the function was defined in users code or in standard library.
   * @param statements An array of AstStatement from the AST of the function or method.
   * @param ref AST reference to the corresponding function or method.
   * @returns A CFG instance populated with BBs and edges for the provided statements.
   */
  private createCFGFromStatements(
    idx: CFGIdx,
    name: FunctionName,
    id: number,
    kind: "function" | "method" | "receive",
    origin: "user" | "stdlib",
    statements: AstStatement[] | null,
    ref: SrcInfo,
  ): CFG {
    const [bbs, edges] =
      statements === null ? [[], []] : this.processStatements(statements);
    this.markExitBBs(bbs);
    return new CFG(name, id, kind, origin, bbs, edges, ref, idx);
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
                `${formatPosition(expr.loc)}Calling an unknown contract method: ${expr.method.text}`,
              );
            }
          } else {
            // TODO: This could be trivially implemented after introducing typed
            // AST in Tact: https://github.com/tact-lang/tact/issues/289.
            this.ctx.logger.debug(
              `${formatPosition(expr.self.loc)}Accessing an unknown contract: ${expr.self.text}`,
            );
          }
        } else {
          // TODO: This could be trivially implemented after introducing typed
          // AST in Tact: https://github.com/tact-lang/tact/issues/289.
          this.ctx.logger.debug(
            `${formatPosition(expr.self.loc)}Unsupported contract method access: ${expr.self.kind}`,
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
        unreachable(expr);
    }
    return parentCalls;
  }

  /**
   * Determines kind of the basic block while creating statements.
   */
  getBBKind(stmt: AstStatement): BasicBlockKind {
    switch (stmt.kind) {
      case "statement_return":
        return { kind: "exit" };
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
   * @param bbs An optional array of basic blocks to which new nodes will be added.
   * @param edges An optional array of Edge objects to which new edges will be added.
   * @param lastBBIdxes An optional indices representing from which control flow enters the current sequence of statements.
   * @returns A tuple containing the arrays of BasicBlock and Edge objects representing the CFG derived from the statements.
   */
  processStatements(
    statements: AstStatement[],
    bbs: BasicBlock[] = [],
    edges: Edge[] = [],
    lastBBIdxes: BasicBlockIdx[] = [],
  ): [BasicBlock[], Edge[]] {
    statements.forEach((stmt, _index) => {
      const newBB = new BasicBlock(stmt.id, this.getBBKind(stmt));
      bbs.push(newBB);
      // If there's a parent node, connect this node to the parent
      if (lastBBIdxes !== undefined) {
        lastBBIdxes.forEach((idx) => {
          const src = this.getParent(bbs, idx);
          edges.push(this.addEdge(src, newBB));
        });
      }

      if (
        stmt.kind === "statement_let" ||
        stmt.kind === "statement_expression" ||
        stmt.kind === "statement_assign" ||
        stmt.kind === "statement_augmentedassign"
      ) {
        // Update the lastBBIdxes to the current basic block index
        lastBBIdxes = [newBB.idx];
      } else if (stmt.kind === "statement_condition") {
        // Branching logic for trueStatements
        const [trueBBs, trueEdges] = this.processStatements(
          stmt.trueStatements,
          bbs,
          edges,
          [newBB.idx],
        );
        bbs = trueBBs;
        edges = trueEdges;
        const trueEndBB = trueBBs[trueBBs.length - 1];

        if (stmt.falseStatements !== null && stmt.falseStatements.length > 0) {
          // Branching logic for falseStatements
          const [falseBBs, falseEdges] = this.processStatements(
            stmt.falseStatements,
            bbs,
            edges,
            [newBB.idx],
          );
          bbs = falseBBs;
          edges = falseEdges;
          const falseEndBB = falseBBs[falseBBs.length - 1];
          lastBBIdxes = [trueEndBB.idx, falseEndBB.idx];
        } else {
          // Connect the end of the true branch to the next statement
          lastBBIdxes = [trueEndBB.idx];
        }
      } else if (
        stmt.kind === "statement_while" ||
        stmt.kind === "statement_until" ||
        stmt.kind === "statement_repeat" ||
        stmt.kind === "statement_foreach"
      ) {
        // Create an edge from the current BB (loop condition) back to the start of the loop body,
        // and from the end of the loop body back to the current BB to represent the loop's cycle.
        // Also, ensure the loop connects to the next BB after the loop concludes.

        // Process the statements within the loop body.
        const [loopBBs, loopEdges] = this.processStatements(
          stmt.statements,
          bbs,
          edges,
          [newBB.idx],
        );
        bbs = loopBBs;
        edges = loopEdges;

        // Create an edge from the last BB in the loop back to the condition to represent the loop's cycle.
        if (loopBBs.length > 0) {
          const lastBB = loopBBs[loopBBs.length - 1];
          edges.push(this.addEdge(lastBB, newBB));
        }
        // Connect condition with the statement after loop.
        lastBBIdxes = [newBB.idx];
      } else if (
        stmt.kind === "statement_try" ||
        stmt.kind === "statement_try_catch"
      ) {
        // Process the try branch.
        const [tryBBs, tryEdges] = this.processStatements(
          stmt.statements,
          bbs,
          edges,
          [newBB.idx],
        );
        bbs = tryBBs;
        edges = tryEdges;
        // Connect the last try block with statements after this `try` block or
        // with `try` itself if it is empty.
        lastBBIdxes =
          tryBBs.length > 0 ? [tryBBs[tryBBs.length - 1].idx] : [newBB.idx];

        // Handle the `catch` clause.
        if (stmt.kind === "statement_try_catch") {
          const [catchBBs, catchEdges] = this.processStatements(
            stmt.catchStatements,
            bbs,
            edges,
            [newBB.idx],
          );
          bbs = catchBBs;
          edges = catchEdges;
          // Catch block always terminates execution.
          if (catchBBs.length > 0) {
            tryBBs[tryBBs.length - 1].kind = { kind: "exit" };
          }
        }
      } else if (stmt.kind === "statement_return") {
        // No need to connect return statements to subsequent basic blocks
        lastBBIdxes = [];
      } else {
        unreachable(stmt);
      }
    });

    return [bbs, edges];
  }

  /**
   * Marks basic blocks without successors as Exit kind.
   * @param bbs The array of BasicBlock objects.
   * @param edges The array of Edge objects.
   */
  private markExitBBs(bbs: BasicBlock[]): void {
    const bbHasSuccessors = (bb: BasicBlock): boolean => bb.dstEdges.size > 0;
    bbs.forEach((bb) => {
      if (!bbHasSuccessors(bb)) {
        bb.kind = { kind: "exit" };
      }
    });
  }

  private getParent(bbs: BasicBlock[], idx: BasicBlockIdx): BasicBlock {
    const bb = bbs.find((bb) => bb.idx === idx);
    if (bb === undefined) {
      throw InternalException.make(
        `Cannot find BB #${idx}. Available BBs: ${bbs.map((n) => n.idx)}`,
      );
    }
    return bb;
  }

  private addEdge(src: BasicBlock, dst: BasicBlock): Edge {
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
      throw ExecutionException.make(
        `Unable to find config file at ${resolvedPath}`,
      );
    }
    try {
      return parseConfig(fs.readFileSync(resolvedPath, "utf8"));
    } catch (err) {
      throwZodError(err, {
        msg: `Incorrect Tact Project file ${resolvedPath}:`,
        help: [
          `Ensure ${resolvedPath} is a Tact Project file.`,
          "See https://docs.tact-lang.org/book/config/ for additional information.",
        ].join(" "),
      });
    }
  }

  /**
   * Parses the projects defined in the Tact configuration file, generating an AST for each.
   * @param config The Tact configuration object.
   * @returns A mapping of project names to their corresponding ASTs.
   */
  public parseTactProjects(): Map<ProjectName, AstStore> {
    const project = createNodeFileSystem(
      path.dirname(this.tactConfigPath),
      false,
    );
    const stdlibPath = this.ctx.config.tactStdlibPath ?? setTactStdlibPath();
    const stdlib = createNodeFileSystem(stdlibPath, false);
    return this.config.projects.reduce(
      (acc: Map<ProjectName, AstStore>, projectConfig: ConfigProject) => {
        this.ctx.logger.debug(`Parsing project ${projectConfig.name} ...`);
        try {
          let ctx = new CompilerContext();
          ctx = enableFeatures(ctx, this.ctx.logger, projectConfig);
          ctx = precompile(ctx, project, stdlib, projectConfig.path);
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
    const cu = TactIRBuilder.make(ctx, projectName, ast).build();
    acc.set(projectName, cu);
    return acc;
  }, new Map<ProjectName, CompilationUnit>());
}
