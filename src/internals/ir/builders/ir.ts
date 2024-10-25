import {
  ContractIdx,
  BasicBlock,
  BasicBlockIdx,
  BasicBlockKind,
  CFG,
  CFGIdx,
  CompilationUnit,
  Contract,
  ContractName,
  Edge,
  FunctionKind,
  FunctionName,
  ImportGraph,
  ProjectName,
  TactASTStore,
} from "..";
import { MistiContext } from "../../context";
import { InternalException } from "../../exceptions";
import { formatPosition } from "../../tact";
import { unreachable } from "../../util";
import { CallGraph } from "../callGraph";
import { TactASTStoreBuilder } from "./astStore";
import {
  AstContractDeclaration,
  AstExpression,
  AstReceiver,
  AstStatement,
  SrcInfo,
  isSelfId,
} from "@tact-lang/compiler/dist/grammar/ast";
import { AstStore } from "@tact-lang/compiler/dist/grammar/store";

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

export class TactCallGraphBuilder {
  /**
   * Builds a CallGraph for the provided AST Store.
   * @param astStore The TactASTStore containing AST nodes and function definitions.
   * @returns A CallGraph instance built from the AST nodes.
   */
  static buildCallGraph(astStore: TactASTStore): CallGraph {
    const callGraph = new CallGraph();
    return callGraph.build(astStore);
  }
}
/**
 * Represents a stateful object which is responsible for constructing the IR of a Tact project.
 *
 * It creates a one-statement-per-basic-block CFG.
 */
export class TactIRBuilder {
  /**
   * Keeps unique identifiers registered for building CFG nodes for free functions.
   */
  private functionIndexes: Map<FunctionName, CFGIdx> = new Map();

  /**
   * Keeps unique identifiers registered for building CFG nodes for contract methods.
   */
  private methodIndexes: Map<ContractName, Map<FunctionName, CFGIdx>> =
    new Map();

  /**
   * @param projectName The name of the project being compiled and analyzed, used for referencing within the compilation environment.
   * @param ast The AST of the project.
   */
  private constructor(
    private ctx: MistiContext,
    private projectName: ProjectName,
    private ast: AstStore,
    private imports: ImportGraph,
  ) {
    this.registerFunctions();
    this.registerContracts();
  }
  public static make(
    ctx: MistiContext,
    projectName: ProjectName,
    ast: AstStore,
    imports: ImportGraph,
  ): TactIRBuilder {
    return new TactIRBuilder(ctx, projectName, ast, imports);
  }

  /**
   * Transforms an AST into a `CompilationUnit` object.
   */
  build(): CompilationUnit {
    const functions = this.createFunctions();
    const contracts = this.createContracts();
    const tactASTStore = TactASTStoreBuilder.make(this.ctx, this.ast).build();
    const callGraph = TactCallGraphBuilder.buildCallGraph(tactASTStore);
    return new CompilationUnit(
      this.projectName,
      TactASTStoreBuilder.make(this.ctx, this.ast).build(),
      this.imports,
      functions,
      contracts,
      callGraph,
    );
  }

  /**
   * Assign the unique CFG indices to free function definitions.
   */
  private registerFunctions(): void {
    this.functionIndexes = this.ast.functions.reduce((acc, fun) => {
      if (fun.kind == "function_def") {
        const funName = fun.name.text as FunctionName;
        const idx = this.registerCFGIdx(
          funName,
          fun.id,
          "function",
          fun.loc.origin,
          fun.loc,
        );
        acc.set(funName, idx);
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
        const funName = fun.name.text as FunctionName;
        const idx = this.functionIndexes.get(funName)!;
        acc.set(
          idx,
          this.createCFGFromStatements(
            idx,
            funName,
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
  ): [
    FunctionName | undefined,
    FunctionKind | undefined,
    AstStatement[] | null,
  ] {
    return decl.kind === "function_def"
      ? [decl.name.text as FunctionName, "method", decl.statements]
      : decl.kind === "contract_init"
        ? [`init_${contractId}` as FunctionName, "method", decl.statements]
        : decl.kind === "receiver"
          ? [
              generateReceiveName(decl) as FunctionName,
              "receive",
              decl.statements,
            ]
          : [undefined, undefined, null];
  }

  /**
   * Assign the unique CFG indices to contract methods.
   */
  private registerContracts(): void {
    this.methodIndexes = this.ast.types.reduce((acc, entry) => {
      if (entry.kind == "contract") {
        const contractName = entry.name.text as ContractName;
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
        const contractName = entry.name.text as ContractName;
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
      case "method_call":
        if (expr.self.kind === "id" && isSelfId(expr.self)) {
          const contractMethods = this.methodIndexes.get(
            expr.self.text as ContractName,
          );
          if (contractMethods) {
            const methodIdx = contractMethods.get(
              expr.method.text as FunctionName,
            );
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
      case "static_call":
        const funcIdx = this.functionIndexes.get(
          expr.function.text as FunctionName,
        );
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

/**
 * Creates the Intermediate Representation (IR) for the given projects.
 *
 * @param ast AST parsed using the Tact parser.
 * @param imports An optional imports graph for the given projects, if available.
 * @returns A mapping of project names to their corresponding CompilationUnit objects.
 */
export function createIR(
  ctx: MistiContext,
  projectName: ProjectName,
  ast: AstStore,
  imports: ImportGraph,
): CompilationUnit {
  return TactIRBuilder.make(ctx, projectName, ast, imports).build();
}
