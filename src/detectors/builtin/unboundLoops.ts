import {
  ASTStatement,
  ASTRef,
  ASTExpression,
  ASTStatementWhile,
  ASTStatementRepeat,
  ASTStatementUntil,
} from "@tact-lang/compiler/dist/grammar/ast";
import { Detector } from "../detector";
import { JoinSemilattice } from "../../internals/lattice";
import { CompilationUnit, Node, CFG } from "../../internals/ir";
import { MistiContext } from "../../internals/context";
import {
  Context,
  Fact,
  FactType,
  Relation,
  Executor,
  Rule,
  RuleBody,
  Atom,
} from "../../internals/souffle";
import { createError, MistiTactError, Severity } from "../../internals/errors";
import { foldStatements, forEachExpression } from "../../internals/tactASTUtil";

type LoopRef = ASTRef;

/**
 * Describes a dataflow state of local variables within the loop construction.
 */
interface VariableState {
  /** Variables defined within dataflow of the current function. */
  defined: Map<string, ASTRef>;
  /** Variables used in loop's condition. */
  condition: Map<LoopRef, Map<string, ASTRef>>;
  /** Variables modified within loop's body. */
  modified: Map<LoopRef, Map<string, ASTRef>>;
}

class LoopVariablesLattice implements JoinSemilattice<VariableState> {
  bottom(): VariableState {
    return { defined: new Map(), condition: new Map(), modified: new Map() };
  }

  join(a: VariableState, b: VariableState): VariableState {
    const joinedDefined = this.mergeSimpleMaps(a.defined, b.defined);
    const joinedCondition = this.mergeNestedMaps(a.condition, b.condition);
    const joinedModified = this.mergeNestedMaps(a.modified, b.modified);
    return {
      defined: joinedDefined,
      condition: joinedCondition,
      modified: joinedModified,
    };
  }

  leq(a: VariableState, b: VariableState): boolean {
    return (
      this.areSimpleMapsSubsets(a.defined, b.defined) &&
      this.areNestedMapsSubsets(a.condition, b.condition) &&
      this.areNestedMapsSubsets(a.modified, b.modified)
    );
  }

  private mergeSimpleMaps(
    a: Map<string, ASTRef>,
    b: Map<string, ASTRef>,
  ): Map<string, ASTRef> {
    const mergedMap = new Map(a);
    b.forEach((value, key) => mergedMap.set(key, value));
    return mergedMap;
  }

  private mergeNestedMaps(
    a: Map<LoopRef, Map<string, ASTRef>>,
    b: Map<LoopRef, Map<string, ASTRef>>,
  ): Map<LoopRef, Map<string, ASTRef>> {
    const mergedMap = new Map(a);
    b.forEach((innerMap, key) => {
      if (mergedMap.has(key)) {
        mergedMap.set(key, this.mergeSimpleMaps(mergedMap.get(key)!, innerMap));
      } else {
        mergedMap.set(key, new Map(innerMap));
      }
    });
    return mergedMap;
  }

  private areSimpleMapsSubsets(
    a: Map<string, ASTRef>,
    b: Map<string, ASTRef>,
  ): boolean {
    return [...a].every(([key, value]) => b.has(key) && b.get(key) === value);
  }

  private areNestedMapsSubsets(
    a: Map<LoopRef, Map<string, ASTRef>>,
    b: Map<LoopRef, Map<string, ASTRef>>,
  ): boolean {
    return [...a].every(
      ([key, innerMap]) =>
        b.has(key) && this.areSimpleMapsSubsets(innerMap, b.get(key)!),
    );
  }
}

interface Transfer<State> {
  /**
   * Transforms the input state based on the analysis of a CFG node.
   *
   * This function updates the state of dataflow analysis as it processes
   * each node (e.g., statements, expressions) in a control flow graph,
   * reflecting changes due to program actions.
   *
   * @param node The CFG construct being analyzed.
   * @param stmt The statement defined within the node.
   * @param inState The dataflow state prior to the execution of `node`.
   * @returns The updated dataflow state post node execution.
   */
  transfer(inState: State, node: Node, stmt: ASTStatement): State;
}

class LoopTransfer implements Transfer<VariableState> {
  public transfer(
    inState: VariableState,
    _node: Node,
    stmt: ASTStatement,
  ): VariableState {
    const outState = { ...inState };
    switch (stmt.kind) {
      case "statement_let":
        outState.defined.set(stmt.name, stmt.ref);
        break;
      case "statement_while":
        this.processCondition(outState, stmt.ref, stmt.condition);
        this.processBody(outState, stmt);
        break;
      case "statement_until":
        this.processCondition(outState, stmt.ref, stmt.condition);
        this.processBody(outState, stmt);
        break;
      case "statement_repeat":
        this.processCondition(outState, stmt.ref, stmt.condition);
        this.processBody(outState, stmt);
        break;
      default:
        break;
    }
    return outState;
  }

  /**
   * Processes loop's condition collecting the variables defined in it to the out state.
   */
  private processCondition(
    outState: VariableState,
    loopRef: ASTRef,
    expr: ASTExpression,
  ): void {
    forEachExpression(expr, (expr) => {
      if (expr.kind === "id" && outState.defined.has(expr.value)) {
        this.setDefault(outState.condition, loopRef, expr.value, expr.ref);
      }
    });
  }

  /**
   * Processes loop's body collecting information about variables used within the loop.
   */
  private processBody(
    outState: VariableState,
    loop: ASTStatementWhile | ASTStatementRepeat | ASTStatementUntil,
  ): void {
    const conditionVars = outState.condition.get(loop.ref);
    if (conditionVars === undefined) {
      return; // Loop doesn't have variables in its condition
    }
    loop.statements.forEach((stmt) => {
      forEachExpression(stmt, (expr) => {
        // Find expressions that potentially modify a value of loop variables
        if (expr.kind === "id" && conditionVars.has(expr.value)) {
          this.setDefault(outState.modified, stmt.ref, expr.value, expr.ref);
        }
      });
    });
  }

  /**
   * Ensures that a key-value pair is added to a nested map, initializing a new inner map if necessary.
   */
  private setDefault(
    outerMap: Map<LoopRef, Map<string, ASTRef>>,
    loopRef: LoopRef,
    innerKey: string,
    innerValue: ASTRef,
  ): void {
    let innerMap = outerMap.get(loopRef);
    if (!innerMap) {
      innerMap = new Map<string, ASTRef>();
      outerMap.set(loopRef, innerMap);
    }
    innerMap.set(innerKey, innerValue);
  }
}

/**
 * A detector that analyzes loop conditions and control flow to ensure loops have proper termination criteria.
 *
 * ## Why is it bad?
 * An unbounded loop can be problematic for several reasons:
 * * Unexpected Behavior: Without a defined termination, loops can lead to unpredictable contract behavior and make debugging difficult.
 * * Out-of-gas Attacks: Continuous looping without termination can lead to out-of-gas attacks.
 * * DoS Attacks: Malicious actors can exploit unbounded loops to create denial-of-service attacks, impacting contract's availability.
 *
 * ## Example
 * ```tact
 * let x: Int = 10;
 * while (x > 0) {
 *   // Bad: x is not changed due looping
 *   send(SendParameters{ to: sender(), ... });
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * let x: Int = 10;
 * while (x > 0) {
 *   send(SendParameters{ to: sender(), ... });
 *   x = x - 1;
 * }
 * ```
 */
export class UnboundLoops extends Detector {
  check(_ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    cu.forEachCFG(cu.ast, (cfg: CFG, _: Node, stmt: ASTStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const lattice = new LoopVariablesLattice();
    });

    // TODO: Create and solve dataflow equations using Souffle
    return [];
  }

  /**
   * Collects dataflow info within a single loop statement.
   */
  private collectLoopInfo(lattice: LoopVariablesLattice) {}
}
