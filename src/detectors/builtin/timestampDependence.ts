import { BasicBlock, Cfg, CompilationUnit } from "../../internals/ir";
import { JoinSemilattice } from "../../internals/lattice";
import { WorklistSolver } from "../../internals/solver/";
import { forEachExpression } from "../../internals/tact";
import { findInExpressions } from "../../internals/tact/iterators";
import { Transfer } from "../../internals/transfer";
import { mergeSets, isSetSubsetOf } from "../../internals/util";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { DataflowDetector } from "../detector";
import {
  AstExpression,
  AstStatement,
  AstStatementLet,
  AstStatementAssign,
  AstStatementAugmentedAssign,
  AstStatementReturn,
  AstStatementExpression,
  AstStatementForEach,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Dataflow state for tracking variables and fields tainted by `now()`.
 */
interface NowTaintState {
  taintedVars: Set<string>;
  taintedFields: Set<string>;
}

/**
 * Lattice for sets of tainted variables and fields.
 */
class NowTaintLattice implements JoinSemilattice<NowTaintState> {
  /**
   * Returns the bottom state, where no variables or fields are tainted.
   */
  bottom(): NowTaintState {
    return {
      taintedVars: new Set(),
      taintedFields: new Set(),
    };
  }

  /**
   * Joins two taint states by merging their tainted variables and fields.
   */
  join(a: NowTaintState, b: NowTaintState): NowTaintState {
    return {
      taintedVars: mergeSets(a.taintedVars, b.taintedVars),
      taintedFields: mergeSets(a.taintedFields, b.taintedFields),
    };
  }

  /**
   * Determines if one taint state is a subset of another.
   */
  leq(a: NowTaintState, b: NowTaintState): boolean {
    return (
      isSetSubsetOf(a.taintedVars, b.taintedVars) &&
      isSetSubsetOf(a.taintedFields, b.taintedFields)
    );
  }
}

/**
 * Transfer function for taint analysis.
 * Marks variables and fields as tainted if they originate from `now()`.
 */
class NowTaintTransfer implements Transfer<NowTaintState> {
  transfer(
    inState: NowTaintState,
    _bb: BasicBlock,
    stmt: AstStatement,
  ): NowTaintState {
    const outState: NowTaintState = {
      taintedVars: new Set(inState.taintedVars),
      taintedFields: new Set(inState.taintedFields),
    };
    switch (stmt.kind) {
      case "statement_let": {
        const letStmt = stmt as AstStatementLet;
        if (this.isExpressionTainted(letStmt.expression, outState)) {
          outState.taintedVars.add(letStmt.name.text);
        }
        break;
      }
      case "statement_assign":
      case "statement_augmentedassign": {
        const assignStmt = stmt as
          | AstStatementAssign
          | AstStatementAugmentedAssign;
        if (this.isExpressionTainted(assignStmt.expression, outState)) {
          // Taint the left-hand side of the assignment if applicable.
          if (assignStmt.path.kind === "id") {
            outState.taintedVars.add(assignStmt.path.text);
          } else if (assignStmt.path.kind === "field_access") {
            if (
              assignStmt.path.aggregate.kind === "id" &&
              assignStmt.path.aggregate.text === "self"
            ) {
              outState.taintedFields.add(assignStmt.path.field.text);
            }
          }
        }
        break;
      }
      case "statement_condition":
      case "statement_while":
      case "statement_until":
      case "statement_repeat": {
        const condition =
          stmt.kind === "statement_condition"
            ? (stmt as any).condition
            : (stmt as any).expression;
        if (this.isExpressionTainted(condition, outState)) {
          // Variables used in the condition as tainted
          forEachExpression(condition, (expr) => {
            if (expr.kind === "id") {
              outState.taintedVars.add(expr.text);
            }
          });
        }
        break;
      }
      case "statement_return": {
        const returnStmt = stmt as AstStatementReturn;
        if (this.isExpressionTainted(returnStmt.expression, outState)) {
        }
        break;
      }
      case "statement_expression": {
        const exprStmt = stmt as AstStatementExpression;
        if (this.isExpressionTainted(exprStmt.expression, outState)) {
          // Variables used in the expression as tainted
          forEachExpression(exprStmt.expression, (expr) => {
            if (expr.kind === "id") {
              outState.taintedVars.add(expr.text);
            }
          });
        }
        break;
      }
      case "statement_try":
      case "statement_try_catch": {
        break;
      }
      case "statement_foreach": {
        const foreachStmt = stmt as AstStatementForEach;
        if (this.isExpressionTainted(foreachStmt.map, outState)) {
          if (foreachStmt.keyName?.kind === "id") {
            outState.taintedVars.add(foreachStmt.keyName.text);
          }
          if (foreachStmt.valueName?.kind === "id") {
            outState.taintedVars.add(foreachStmt.valueName.text);
          }
        }
        break;
      }
    }
    return outState;
  }

  /**
   * Recursively checks if an expression uses `now()` or another tainted variable/field.
   */
  private isExpressionTainted(
    expr: AstExpression | null,
    state: NowTaintState,
  ): boolean {
    if (!expr) return false;
    return (
      findInExpressions(expr, (subExpr) => {
        switch (subExpr.kind) {
          case "static_call":
            return (
              subExpr.function?.kind === "id" && subExpr.function.text === "now"
            );
          case "method_call":
            if (subExpr.method.kind === "id") {
              return (
                subExpr.method.text === "getTainted" ||
                state.taintedVars.has(subExpr.method.text)
              );
            }
            return false;
          case "id":
            return (
              state.taintedVars.has(subExpr.text) || subExpr.text === "now"
            );
          case "field_access":
            if (
              subExpr.aggregate.kind === "id" &&
              subExpr.aggregate.text === "self"
            ) {
              return state.taintedFields.has(subExpr.field.text);
            }
            return false;
          case "op_binary":
            return (
              this.isExpressionTainted(subExpr.left, state) ||
              this.isExpressionTainted(subExpr.right, state)
            );
          default:
            return false;
        }
      }) !== null
    );
  }
}

/**
 * TimestampDependence Detector
 *
 * Detects dependencies on `now()` or time-based variables.
 *
 * ## Why is it bad?
 * The `now()` function relies on predictable block timestamps, which are publicly visible.
 * Using `now()` for randomness, loop conditions, or variable assignments can lead to vulnerabilities.
 *
 * ## Example
 * ```tact
 * contract Example {
 *   value: Int;
 *   init() {
 *       self.value = now();  // Bad: Using `now()` directly
 *   }
 * }
 * ```
 */
export class TimestampDependence extends DataflowDetector {
  severity = Severity.LOW;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    cu.forEachCFG((cfg: Cfg) => {
      const lattice = new NowTaintLattice();
      const transfer = new NowTaintTransfer();
      const solver = new WorklistSolver<NowTaintState>(
        cu,
        cfg,
        transfer,
        lattice,
        "forward",
      );
      const results = solver.solve();
      cfg.forEachBasicBlock(cu.ast, (stmt, bb) => {
        const state = results.getState(bb.idx);
        if (!state) return;
        const suspiciousUsages = this.checkSuspiciousUsage(stmt, state);
        warnings.push(...suspiciousUsages);
      });
    });
    return warnings;
  }

  /**
   * Checks for suspicious usage of `now()` or tainted variables in a statement.
   */
  private checkSuspiciousUsage(
    stmt: AstStatement,
    state: NowTaintState,
  ): MistiTactWarning[] {
    const warnings: MistiTactWarning[] = [];
    const isTainted = this.isStatementTainted(stmt, state);
    if (isTainted) {
      warnings.push(
        this.makeWarning(this.classifySuspiciousContext(stmt), stmt.loc, {
          extraDescription: "Conditional logic depends on `now()`.",
          suggestion:
            "Avoid using `now()` for logic. Replace it with deterministic or external data.",
        }),
      );
    }
    return warnings;
  }

  /**
   * Determines if a statement is tainted.
   */
  private isStatementTainted(
    stmt: AstStatement,
    state: NowTaintState,
  ): boolean {
    const expressions: AstExpression[] = [];
    forEachExpression(stmt, (e) => expressions.push(e));

    return expressions.some((expr) => {
      let found = false;
      forEachExpression(expr, (subExpr) => {
        if (
          (subExpr.kind === "static_call" &&
            subExpr.function?.kind === "id" &&
            subExpr.function.text === "now") ||
          (subExpr.kind === "id" &&
            (subExpr.text === "now" || state.taintedVars.has(subExpr.text))) ||
          (subExpr.kind === "field_access" &&
            subExpr.aggregate.kind === "id" &&
            subExpr.aggregate.text === "self" &&
            state.taintedFields.has(subExpr.field.text))
        ) {
          found = true;
        }
      });
      return found;
    });
  }

  /**
   * Classifies suspicious contexts for taint warnings.
   */
  private classifySuspiciousContext(stmt: AstStatement): string {
    switch (stmt.kind) {
      case "statement_condition":
        return "Tainted timestamp used in a condition";
      case "statement_return":
        return "Returning a tainted timestamp";
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
        return "Loop condition depends on tainted timestamp";
      case "statement_assign":
      case "statement_augmentedassign":
        return "Assignment uses now() or a tainted variable";
      case "statement_let":
        return "Variable declaration uses now() or a tainted variable";
      default:
        return "Time-dependent usage found";
    }
  }
}
