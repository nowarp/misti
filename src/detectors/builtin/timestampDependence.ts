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
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Dataflow state for tracking variables tainted by `now()`.
 */
interface NowTaintState {
  taintedVars: Set<string>;
}

/**
 * Lattice for sets of tainted variables.
 */
class NowTaintLattice implements JoinSemilattice<NowTaintState> {
  bottom(): NowTaintState {
    return { taintedVars: new Set() };
  }

  join(a: NowTaintState, b: NowTaintState): NowTaintState {
    return {
      taintedVars: mergeSets(a.taintedVars, b.taintedVars),
    };
  }

  leq(a: NowTaintState, b: NowTaintState): boolean {
    return isSetSubsetOf(a.taintedVars, b.taintedVars);
  }
}

/**
 * Transfer function marks variables as tainted if they come from `now()`.
 */
class NowTaintTransfer implements Transfer<NowTaintState> {
  public transfer(
    inState: NowTaintState,
    _bb: BasicBlock,
    stmt: AstStatement,
  ): NowTaintState {
    const outState: NowTaintState = {
      taintedVars: new Set(inState.taintedVars),
    };
    // For each statement, handle how taint flows.
    switch (stmt.kind) {
      case "statement_let":
        this.processLet(outState, stmt as AstStatementLet);
        break;
      case "statement_assign":
      case "statement_augmentedassign":
        this.processAssignment(outState, stmt);
        break;
      default:
        break;
    }
    return outState;
  }

  /**
   * Processes a variable declaration to determine if it introduces tainted variables.
   * @param state - Current taint state.
   * @param stmt - Variable declaration statement to analyze.
   */
  private processLet(state: NowTaintState, stmt: AstStatementLet): void {
    // If the RHS expression is tainted, then the newly defined variable becomes tainted.
    if (this.isExpressionTainted(state, stmt.expression)) {
      state.taintedVars.add(stmt.name.text);
    }
  }

  /**
   * Processes an assignment statement to determine if it propagates taint.
   * @param state - Current taint state.
   * @param stmt - Assignment statement to analyze.
   */
  private processAssignment(state: NowTaintState, stmt: AstStatement): void {
    if (
      stmt.kind === "statement_assign" ||
      stmt.kind === "statement_augmentedassign"
    ) {
      const assignStmt = stmt as
        | AstStatementAssign
        | AstStatementAugmentedAssign;
      if (this.isExpressionTainted(state, assignStmt.expression)) {
        // If LHS is a simple identifier, mark it as tainted.
        if (assignStmt.path.kind === "id") {
          state.taintedVars.add(assignStmt.path.text);
        }
      }
    }
  }

  /**
   * Recursively checks if an expression uses `now()` or another tainted variable.
   * @param state - Current taint state.
   * @param expr - Expression to analyze.
   * @returns True if the expression is tainted; otherwise, false.
   */
  private isExpressionTainted(
    state: NowTaintState,
    expr: AstExpression | null,
  ): boolean {
    if (!expr) return false;
    return (
      findInExpressions(
        expr,
        (subExpr) =>
          // Check direct usage of now()
          (subExpr.kind === "static_call" &&
            subExpr.function?.kind === "id" &&
            subExpr.function.text === "now") ||
          (subExpr.kind === "id" && subExpr.text === "now") ||
          // Reference to a known tainted variable
          (subExpr.kind === "id" && state.taintedVars.has(subExpr.text)),
      ) !== null
    );
  }
}

/**
 * TimestampDependence Detector
 *
 * An optional detector that identifies dependencies on `now()` or other time-based variables.
 *
 * ## Why is it bad?
 * The `now()` function relies on predictable block timestamps, which are publicly visible.
 * Using `now()` for logic such as randomness, loop conditions, or variable assignments can
 * lead to exploitable vulnerabilities and erroneous behavior. Block timestamps are not secure
 * and should not be relied upon for anything requiring unpredictability or stability.
 *
 * ## Example
 * ```tact
 * contract TimestampTest {
 *   value: Int;
 *
 *   // Bad: Usage in assignment
 *   init() {
 *       self.value = now();
 *   }
 *
 *   // Bad: Using `now()` as variable
 *   receive("test1") {
 *       let time: Int = now();
 *       self.value = time;
 *   }
 *
 *   // Bad: In loop conditions
 *   receive("test2") {
 *       let start: Int = now();
 *
 *       // While loop dependent on `now()`
 *       while (now() < start + 1000) {
 *           self.value += 1;
 *       }
 *    }
 * ```
 *
 * Use instead:
 * ```tact
 * contract TimestampTest {
 *   value: Int;
 *
 *   // Use an external timestamp passed as a parameter or derived deterministically
 *   init(startTime: Int) {
 *       self.value = startTime;  // Good: Deterministic initialization
 *   }
 *
 *   receive("test2") {
 *       let start: Int = external_timestamp();  // Good: Use external data
 *
 *       // Avoid `now()` in conditions
 *       while (get_current_time() < start + 1000) {
 *           self.value += 1;
 *       }
 *   }
 * }
 * ```
 */

export class TimestampDependence extends DataflowDetector {
  severity = Severity.LOW;

  public async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    let warnings: MistiTactWarning[] = [];
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
      // Solve dataflow: figure out which variables end up tainted.
      const analysisResults = solver.solve();

      // For each statement in this CFG, see if it uses a tainted expression suspiciously.
      cfg.forEachBasicBlock(cu.ast, (stmt, bb) => {
        const state = analysisResults.getState(bb.idx);
        if (!state) {
          return;
        }
        const suspiciousUsages = this.checkSuspiciousUsage(stmt, state);
        warnings = warnings.concat(suspiciousUsages);
      });
    });
    return warnings;
  }

  /**
   * Inspects a single statement to see if should raise a warning.
   */
  private checkSuspiciousUsage(
    stmt: AstStatement,
    state: NowTaintState,
  ): MistiTactWarning[] {
    // Gather all expressions in the statement
    const suspiciousExpressions: AstExpression[] = [];
    forEachExpression(stmt, (e) => suspiciousExpressions.push(e));
    const isTainted = suspiciousExpressions.some((expr) =>
      this.isExpressionDirectlyTainted(expr, state),
    );
    if (!isTainted) {
      return [];
    }
    return [
      this.makeWarning(this.classifySuspiciousContext(stmt), stmt.loc, {
        extraDescription: "Conditional logic depends on `now()`.",
        suggestion:
          "Detailed check variable now() base on your code. " +
          "Now() is predictable. " +
          "Block timestamps are publicly visible, making them unsuitable for generating random numbers.",
      }),
    ];
  }

  /**
   * Checks if an expression directly references `now()` or a tainted variable.
   */
  private isExpressionDirectlyTainted(
    expr: AstExpression,
    state: NowTaintState,
  ): boolean {
    let found = false;
    forEachExpression(expr, (subExpr) => {
      if (
        (subExpr.kind === "static_call" &&
          subExpr.function?.kind === "id" &&
          subExpr.function.text === "now") ||
        (subExpr.kind === "id" && subExpr.text === "now")
      ) {
        found = true;
      }
      if (subExpr.kind === "id" && state.taintedVars.has(subExpr.text)) {
        found = true;
      }
    });
    return found;
  }

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
