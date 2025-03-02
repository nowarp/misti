import {
  AstStoreFunction,
  BasicBlock,
  Cfg,
  CompilationUnit,
  Effect,
} from "../../internals/ir";
import { JoinSemilattice } from "../../internals/lattice";
import { WorklistSolver } from "../../internals/solver/";
import {
  AstNodeId,
  foldExpressions,
  getMethodCallsChain,
  isSelf,
  isStdlibMutationMethod,
  SEND_FUNCTIONS,
  SEND_METHODS,
} from "../../internals/tact";
import {
  AstExpression,
  AstId,
  AstStatement,
  AstTypedParameter,
} from "../../internals/tact/imports";
import { prettyPrint } from "../../internals/tact/imports";
import { idText } from "../../internals/tact/imports";
import { Transfer } from "../../internals/transfer";
import { unreachable, mergeLists } from "../../internals/util";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { DataflowDetector } from "../detector";

class ArgTaint {
  readonly id: AstNodeId;
  readonly parents: AstNodeId[];
  readonly name: string;
  // Poor man's path-sensitivity: we don't care about path contexts; we only
  // need to set this flag and ensure the transfer function maintains
  // monotonicity.
  readonly unprotected: boolean;

  constructor(
    node: AstId,
    {
      parents = [],
      unprotected = true,
    }: Partial<{ parents: AstNodeId[]; unprotected: boolean }> = {},
  ) {
    this.id = node.id;
    this.name = idText(node);
    this.parents = parents;
    this.unprotected = unprotected;
  }

  static eq(lhs: ArgTaint, rhs: ArgTaint): boolean {
    return (
      lhs.id === rhs.id &&
      lhs.name === rhs.name &&
      lhs.parents.length === rhs.parents.length &&
      lhs.parents.every((v, i) => v === rhs.parents[i])
    );
  }
}

interface TaintState {
  argTaints: ArgTaint[];
}

/**
 * Recursively identifies tainted values in AST expressions.
 *
 * @param acc Output taint accumulator
 * @param expr AST expression to analyze
 * @param out Current taint state
 */
function findTaints(
  acc: ArgTaint[] = [],
  expr: AstExpression,
  out: Readonly<TaintState>,
): void {
  const findUnprotectedArg = (
    name: string,
    args: ArgTaint[],
  ): ArgTaint | undefined =>
    args.find((arg) => arg.name === name && arg.unprotected);
  switch (expr.kind) {
    case "id":
      const taint = findUnprotectedArg(idText(expr), out.argTaints);
      if (taint) acc.push(taint);
      break;
    case "op_binary":
      findTaints(acc, expr.left, out);
      findTaints(acc, expr.right, out);
      break;
    case "op_unary":
      findTaints(acc, expr.operand, out);
      break;
    case "conditional":
      findTaints(acc, expr.condition, out);
      findTaints(acc, expr.thenBranch, out);
      findTaints(acc, expr.elseBranch, out);
      break;
    case "method_call":
      // Propagate taint through method call chains: taint.method1().method2()
      // Heuristic: If the base object originated from a function argument and
      // we're calling its methods, it's likely a mutable structure (e.g.,
      // Slice or Cell).
      const chain = getMethodCallsChain(expr);
      if (chain && chain.self.kind === "id") {
        const taint = findUnprotectedArg(idText(chain.self), out.argTaints);
        if (taint) acc.push(taint);
      }
      break;
    case "static_call":
      break;
    case "struct_instance":
    case "struct_value":
    case "field_access":
    case "init_of":
    case "code_of":
      break;
    case "string":
    case "simplified_string":
    case "address":
    case "cell":
    case "slice":
    case "number":
    case "boolean":
    case "null":
      break;
    default:
      unreachable(expr);
  }
}

class TaintLattice implements JoinSemilattice<TaintState> {
  constructor(private funArgs: ArgTaint[]) {}

  bottom(): TaintState {
    return {
      argTaints: this.funArgs,
    };
  }

  join(a: TaintState, b: TaintState): TaintState {
    const argTaints = mergeLists(a.argTaints, b.argTaints);
    return {
      argTaints,
    };
  }

  leq(a: TaintState, b: TaintState): boolean {
    return a.argTaints.every((x) => b.argTaints.some((y) => ArgTaint.eq(x, y)));
  }
}

class UnprotectedCallTransfer implements Transfer<TaintState> {
  public transfer(
    inState: TaintState,
    _node: BasicBlock,
    stmt: AstStatement,
  ): TaintState {
    const out = {
      argTaints: [...inState.argTaints],
    };
    this.processStatement(out, stmt);
    return out;
  }

  private processStatement(out: TaintState, stmt: AstStatement) {
    this.addNewTaints(out, stmt);
    this.trackConditions(out, stmt);
  }

  private trackConditions(out: TaintState, stmt: AstStatement) {
    if (stmt.kind === "statement_condition") {
      const argTaints: ArgTaint[] = [];
      findTaints(argTaints, stmt.condition, out);
      out.argTaints = out.argTaints.map((existing) =>
        argTaints.some((found) => found.id === existing.id)
          ? { ...existing, unprotected: false }
          : existing,
      );
    }
  }

  private addNewTaints(out: TaintState, stmt: AstStatement) {
    const lhsRhs = (() => {
      if (
        (stmt.kind === "statement_assign" ||
          stmt.kind === "statement_augmentedassign") &&
        stmt.path.kind === "id"
      )
        return { lhs: stmt.path, rhs: stmt.expression };
      else if (stmt.kind === "statement_let")
        return { lhs: stmt.name, rhs: stmt.expression };
      else return undefined;
    })();
    if (lhsRhs) {
      const { lhs, rhs } = lhsRhs;
      const taints: ArgTaint[] = [];
      findTaints(taints, rhs, out);
      if (taints.length > 0) {
        const taint = new ArgTaint(lhs, { parents: taints.map((t) => t.id) });
        out.argTaints.push(taint);
      }
    }
  }
}

/**
 * A detector that identifies unprotected calls or state modifications.
 *
 * ## Why is it bad?
 * Without conditions or permission checks, some calls can be exploited to
 * disrupt the contract's intended behavior or allow malicious actors to
 * perform unauthorized actions. For example, a publicly accessible `set`
 * function in a mapping or an unguarded `send` call can enable draining
 * contract's funds, denial-of-service (DoS) attacks or other malicious
 * activities.
 *
 * ## Example
 * ```tact
 * receive(msg: Insert) {
 *     // Bad: No protection for the mapping update
 *     m.set(msg.key, msg.val);
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * receive(msg: Insert) {
 *     // OK: Permission check ensures only the owner can modify the state
 *     require(ctx.sender == this.owner, "Invalid sender");
 *     m.set(msg.key, msg.val);
 * }
 * ```
 */
export class UnprotectedCall extends DataflowDetector {
  severity = Severity.HIGH;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    let warnings: MistiTactWarning[] = [];
    cu.forEachCFG((cfg: Cfg) => {
      const astFun = cu.ast.getFunction(cfg.id);
      if (!astFun) {
        this.ctx.logger.warn(`Cannot find AST node for BB #${cfg.id}`);
        return;
      }
      if (!this.hasCallsToCheck(cu, cfg.id)) return;
      const argTaints = this.getArgTaints(astFun);
      const lattice = new TaintLattice(argTaints);
      const transfer = new UnprotectedCallTransfer();
      const solver = new WorklistSolver(cu, cfg, transfer, lattice, "forward");
      const taintResults = solver.solve();
      cfg.forEachBasicBlock(cu.ast, (stmt, bb) => {
        const state = taintResults.getState(bb.idx);
        if (state === undefined) {
          this.ctx.logger.warn(`${this.id}: Cannot find BB #${bb.idx}`);
          return;
        }
        warnings = warnings.concat(this.checkCalls(stmt, state));
      });
    });
    return warnings;
  }

  private getArgTaints(f: AstStoreFunction): ArgTaint[] {
    const taintOfTypedParam = (p: AstTypedParameter) => new ArgTaint(p.name);
    switch (f.kind) {
      case "function_def":
      case "contract_init":
        return f.params.map(taintOfTypedParam);
      case "receiver":
        switch (f.selector.kind) {
          case "internal":
          case "external":
            if (f.selector.subKind.kind === "simple") {
              return [taintOfTypedParam(f.selector.subKind.param)];
            }
            return [];
          case "bounce":
            return [taintOfTypedParam(f.selector.param)];
          default:
            return [];
        }
      default:
        unreachable(f);
    }
  }

  private checkCalls(
    stmt: AstStatement,
    state: TaintState,
  ): MistiTactWarning[] {
    const inspectArg = (
      acc: MistiTactWarning[],
      arg: AstExpression,
      msg: string,
    ) => {
      // TODO: Print the source of taint (using argTaint.parent)
      const taints: ArgTaint[] = [];
      findTaints(taints, arg, state);
      if (taints.length > 0) {
        acc.push(this.makeWarning(`${msg}: ${prettyPrint(arg)}`, arg.loc));
      }
    };
    const checkUnprotectedSendArg = (
      acc: MistiTactWarning[],
      expr: AstExpression,
    ) => {
      const inspectArg_ = (acc: MistiTactWarning[], arg: AstExpression) =>
        inspectArg(acc, arg, "Unprotected send argument");
      if (
        (expr.kind === "static_call" &&
          SEND_FUNCTIONS.includes(expr.function.text)) ||
        (expr.kind === "method_call" &&
          isSelf(expr.self) &&
          SEND_METHODS.includes(expr.method.text))
      ) {
        expr.args.forEach((a) => {
          if (a.kind === "struct_instance")
            a.args.forEach((afield) => inspectArg_(acc, afield.initializer));
          else inspectArg_(acc, a);
        });
      }
    };
    const checkUnprotectedFieldMutation = (
      acc: MistiTactWarning[],
      expr: AstExpression,
    ) => {
      if (expr.kind === "method_call") {
        const chain = getMethodCallsChain(expr);
        if (
          chain &&
          chain.self.kind === "field_access" &&
          isSelf(chain.self.aggregate) &&
          chain.calls.length === 1 &&
          isStdlibMutationMethod(chain.calls[0])
        ) {
          expr.args.forEach((a) => {
            inspectArg(acc, a, "Unprotected field mutation");
          });
        }
      }
    };
    return foldExpressions(
      stmt,
      (acc, expr) => {
        checkUnprotectedSendArg(acc, expr);
        checkUnprotectedFieldMutation(acc, expr);
        return acc;
      },
      [] as MistiTactWarning[],
    );
  }

  private hasCallsToCheck(cu: CompilationUnit, id: AstNodeId): boolean {
    const cgIdx = cu.callGraph.getNodeIdByAstId(id);
    if (cgIdx === undefined) {
      this.ctx.logger.warn(`Cannot find a CG node for AST ID: #${id}`);
      return false;
    }
    const cgNode = cu.callGraph.getNode(cgIdx);
    if (cgNode === undefined) {
      this.ctx.logger.warn(`Cannot find a CG node for CG ID: #${cgIdx}`);
      return false;
    }
    return cgNode.hasAnyEffect(Effect.Send, Effect.StateWrite);
  }
}
