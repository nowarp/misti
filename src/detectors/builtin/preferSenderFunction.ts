import {
  AstStoreFunction,
  BasicBlock,
  Cfg,
  CompilationUnit,
} from "../../internals/ir";
import { JoinSemilattice } from "../../internals/lattice";
import { WorklistSolver } from "../../internals/solver";
import {
  findInExpressions,
  foldExpressions,
  forEachExpression,
  getMethodCallsChain,
} from "../../internals/tact";
import {
  AstExpression,
  AstId,
  AstStatement,
  idText,
} from "../../internals/tact/imports";
import { Transfer } from "../../internals/transfer";
import { isMapSubsetOf, mergeMaps } from "../../internals/util";
import { Category, Warning, Severity } from "../../internals/warnings";
import { DataflowDetector } from "../detector";

interface ContextVariablesState {
  // Mapping from local variables assigned to `context()` or their taints to
  // called methods and accessed fields.
  readonly vars: Map<string, Set<string>>;
}

class ContextVariablesLattice
  implements JoinSemilattice<ContextVariablesState>
{
  bottom(): ContextVariablesState {
    return {
      vars: new Map(),
    };
  }

  join(
    a: ContextVariablesState,
    b: ContextVariablesState,
  ): ContextVariablesState {
    const vars = mergeMaps(a.vars, b.vars);
    return {
      vars,
    };
  }

  leq(a: ContextVariablesState, b: ContextVariablesState): boolean {
    return isMapSubsetOf(a.vars, b.vars);
  }
}

class ContextVariablesTransfer implements Transfer<ContextVariablesState> {
  public transfer(
    inState: ContextVariablesState,
    _node: BasicBlock,
    stmt: AstStatement,
  ): ContextVariablesState {
    const outState = {
      // The Set values of maps *won't* be copied and are mutating across
      // transfer function invocations. That's the expected behavior, as we
      // need to have all the usage information at the point of definition of
      // the context variable.
      vars: inState.vars,
    };
    this.processLetStatement(outState, stmt);
    this.processContextAccess(outState, stmt);
    return outState;
  }

  private findContextVariable(
    state: ContextVariablesState,
    expr: AstExpression,
  ): string | undefined {
    if (expr.kind === "id") {
      const varName = idText(expr);
      return state.vars.has(varName) ? varName : undefined;
    } else {
      const result = findInExpressions(
        expr,
        (e) => e.kind === "id" && state.vars.has(idText(e)),
      );
      return result ? idText(result as AstId) : undefined;
    }
  }

  private processContextAccess(
    state: ContextVariablesState,
    stmt: AstStatement,
  ): void {
    forEachExpression(stmt, (e) => {
      if (e.kind === "method_call") {
        const chain = getMethodCallsChain(e);
        if (chain && chain.self.kind === "id") {
          const cv = this.findContextVariable(state, chain.self);
          if (cv) {
            chain.calls.forEach((c) => {
              const methods = state.vars.get(cv) || new Set();
              methods.add(idText(c.method));
              state.vars.set(cv, methods);
            });
          }
        }
      } else if (e.kind === "field_access" && e.aggregate.kind === "id") {
        const cv = this.findContextVariable(state, e.aggregate);
        if (cv) {
          // We support only `ctx.field` here; skipping `ctx.field1.field2` as
          // it is impossible.
          const fields = state.vars.get(cv) || new Set();
          fields.add(idText(e.field));
          state.vars.set(cv, fields);
        }
      }
    });
  }

  private processLetStatement(
    outState: ContextVariablesState,
    stmt: AstStatement,
  ): void {
    if (stmt.kind === "statement_let") {
      if (
        stmt.expression.kind === "static_call" &&
        idText(stmt.expression.function) === "context"
      ) {
        // New variable: `let a = context();`
        outState.vars.set(idText(stmt.name), new Set());
      } else if (
        stmt.expression.kind !== "method_call" &&
        stmt.expression.kind !== "field_access"
      ) {
        // Taint assignment: `let a = context(); let b = a;`
        const taint = this.findContextVariable(outState, stmt.expression);
        if (taint) {
          outState.vars.set(
            idText(stmt.name),
            new Set(outState.vars.get(taint)),
          );
        }
      }
    }
  }
}

/**
 * A detector that finds `context().sender` calls that could be replaced with
 * more gas-effective `sender()` call.
 *
 * ## Why is it bad?
 * You can obtain the address of the message sender using either the `Context`
 * struct or the `sender` function. If you only need the address and no
 * additional context on the incoming message , you should prefer less
 * gas-expensive `sender()`.
 *
 * See: https://docs.tact-lang.org/book/gas-best-practices/#use-sender-over-contextsender
 *
 * ## Example
 * ```tact
 * let ctx = context(); // Bad: only .sender is accessed
 * message(MessageParameters{
 *   to: ctx.sender,
 *   value: ton("0.05"),
 * });
 * ```
 *
 * Use instead:
 * ```tact
 * message(MessageParameters{
 *   to: sender(),
 *   value: ton("0.05"),
 * });
 * ```
 */
export class PreferSenderFunction extends DataflowDetector {
  severity = Severity.LOW;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    const warnings = [] as Warning[];
    cu.forEachCFG(
      (cfg: Cfg) => {
        const node = cu.ast.getFunction(cfg.id);
        if (node === undefined) {
          return;
        }
        warnings.push(...this.findDirectContextSender(node));
        warnings.push(...this.findUnusedContext(cu, cfg));
      },
      { includeStdlib: false },
    );
    return warnings;
  }

  /**
   * Warns about direct uses of `context().sender`.
   */
  private findDirectContextSender(node: AstStoreFunction): Warning[] {
    const isContextSender = (expr: AstExpression): boolean =>
      expr.kind === "field_access" &&
      expr.aggregate.kind === "static_call" &&
      idText(expr.aggregate.function) === "context" &&
      expr.field.kind === "id" &&
      idText(expr.field) === "sender";
    return foldExpressions(
      node,
      (acc, expr) => {
        if (isContextSender(expr)) {
          acc.push(
            this.makeWarning(
              "Using gas-expensive `context().sender`",
              expr.loc,
              {
                suggestion:
                  "Consider replacing it with less gas-expensive `sender()` call",
              },
            ),
          );
        }
        return acc;
      },
      [] as Warning[],
    );
  }

  /**
   * Warns about local variables assigned to `context()` when only `.sender`
   * is accessed.
   */
  private findUnusedContext(cu: CompilationUnit, cfg: Cfg): Warning[] {
    const warnings = [] as Warning[];
    const lattice = new ContextVariablesLattice();
    const transfer = new ContextVariablesTransfer();
    const solver = new WorklistSolver(cu, cfg, transfer, lattice, "forward");
    const results = solver.solve();
    cfg.forEachBasicBlock(cu.ast, (stmt, bb) => {
      if (stmt.kind !== "statement_let") return;
      const state = results.getState(bb.idx);
      if (state === undefined) {
        this.ctx.logger.warn(`${this.id}: Cannot find BB #${bb.idx}`);
        return;
      }
      const definedVar = idText(stmt.name);
      const cv = state.vars.get(definedVar);
      if (cv && cv.size === 1 && cv.has("sender")) {
        warnings.push(
          this.makeWarning(
            "Code can be optimized by using `sender()` instead of accessing context",
            stmt.name.loc,
            {
              extraDescription: `The \`${definedVar}\` variable is only used to get the sender`,
              suggestion: `Consider replacing \`${definedVar}.sender\` with the less gas-expensive \`sender()\` call`,
            },
          ),
        );
      }
    });
    return warnings;
  }
}
