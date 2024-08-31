import {
  Context,
  Fact,
  FactType,
  Relation,
  makeAtom,
  makeRuleBody,
  Rule,
} from "../../internals/souffle";
import { SouffleDetector } from "../detector";
import { CompilationUnit, BasicBlock, CFG } from "../../internals/ir";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import {
  forEachExpression,
  forEachStatement,
  foldExpressions,
} from "../../internals/tactASTUtil";
import {
  AstStatement,
  AstNode,
  AstExpression,
  AstOpBinary,
  SrcInfo,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that identifies and corrects instances of division before multiplication to
 * ensure accurate mathematical operations.
 *
 * ## Why is it bad?
 * Performing division before multiplication can lead to unexpected results due to precision loss and rounding errors:
 * * Precision Loss: Dividing first can result in significant precision loss, especially when dealing with integers or fixed-point numbers.
 * * Rounding Errors: Early division might cause rounding errors that propagate through subsequent calculations.
 * * Unexpected Behavior: Incorrectly ordered operations can lead to incorrect outcomes, making debugging and maintenance more challenging.
 *
 * ## Example
 * ```tact
 * let a: Int = 10;
 * let b: Int = 3;
 * let c: Int = 2;
 * // Bad: Division before multiplication
 * let result: Int = a / b * c;
 * ```
 *
 * Use instead:
 * ```tact
 * let a: Int = 10;
 * let b: Int = 3;
 * let c: Int = 2;
 * // Correct: Multiplication before division
 * let result: Int = a * c / b;
 * ```
 */
export class DivideBeforeMultiply extends SouffleDetector {
  check(cu: CompilationUnit): MistiTactWarning[] {
    const program = new Context<SrcInfo>(this.id);
    this.addDecls(program);
    this.addRules(program);
    this.addConstraints(cu, program);
    return this.executeSouffle(program, (fact) => {
      if (fact.data === undefined) {
        throw new Error(`AST position for fact ${fact} is not available`);
      }
      return this.makeWarning(
        "Divide Before Multiply",
        Severity.HIGH,
        fact.data,
        {
          suggestion:
            "Consider rearranging the operations: division should follow multiplication",
        },
      );
    });
  }

  private addDecls(ctx: Context<SrcInfo>): void {
    // Division expression definition.
    ctx.add(
      Relation.from(
        "divDef",
        [
          ["divId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // Division expressions defined within the multiplication expression (both lhs or rhs).
    ctx.add(
      Relation.from(
        "divUsedInMul",
        [
          ["mulId", FactType.Number],
          ["divId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // Local variable definition.
    ctx.add(
      Relation.from(
        "varDef",
        [
          ["var", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // Describes variables appearing in the division expression or assigning to
    // a result of the division.
    // Examples:
    // * `10 / a` or `a / 10` will create a fact `varTaintedWithDiv(a, <id>)`
    // * `let a: Int = 10 / 3;` will create a fact `varTaintedWithDiv(a, <id>)` as well
    ctx.add(
      Relation.from(
        "varTaintedWithDiv",
        [
          ["var", FactType.Symbol],
          ["divId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // Describes variables appearing in the multiply expression.
    // For example: `a * 3` or `3 + (a * 4)` will create a fact `varUsedInMul(a, <id>)`.
    ctx.add(
      Relation.from(
        "varUsedInMul",
        [
          ["mulId", FactType.Number],
          ["var", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // Variable assignment to any expression containing another variable used
    // for taint propagation.
    // For example: `a = (b + 42) - 2` will create a fact: `varAssign(a, b)`.
    ctx.add(
      Relation.from(
        "varAssign",
        [
          ["assigned", FactType.Symbol],
          ["assignee", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // A declaration of the recursive rule that expresses the taint propagation
    // for local variables involved in the division operation.
    ctx.add(
      Relation.from(
        "taintedWithDiv",
        [
          ["var", FactType.Symbol],
          ["divId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // Main rule: simple case.
    ctx.add(
      Relation.from(
        "divBeforeMul",
        [
          ["divId", FactType.Number],
          ["mulId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // Main rule: tainted case.
    ctx.add(
      Relation.from(
        "taintedVarInMul",
        [
          ["var", FactType.Symbol],
          ["divId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    // Projection rule to refer the appropriate division operations in the output
    ctx.add(
      Relation.from(
        "violated",
        [
          ["divId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        "output",
      ),
    );
  }

  private addRules(ctx: Context<SrcInfo>): void {
    // Base case: direct tainting with division. For example:
    // ```
    // let a: Int = 10 / 3;
    // a * 5;
    // ```
    //
    // taintedWithDiv(var, divId, func) :-
    //   varDef(var, func),
    //   divDef(divId, func),
    //   varTaintedWithDiv(var, divId, func).
    ctx.add(
      Rule.from(
        [makeAtom("taintedWithDiv", ["var", "divId", "func"])],
        makeRuleBody(makeAtom("varDef", ["var", "func"])),
        makeRuleBody(makeAtom("divDef", ["divId", "func"])),
        makeRuleBody(makeAtom("varTaintedWithDiv", ["var", "divId", "func"])),
      ),
    );

    // Indirect tainting through another tainted variable.
    // taintedWithDiv(var, divId, func) :-
    //   varDef(var, func),
    //   varDef(intermediateVar, func),
    //   varAssign(var, intermediateVar, func),
    //   taintedWithDiv(intermediateVar, _, func).
    ctx.add(
      Rule.from(
        [makeAtom("taintedWithDiv", ["var", "divId", "func"])],
        makeRuleBody(makeAtom("varDef", ["var", "func"])),
        makeRuleBody(makeAtom("varDef", ["intermediateVar", "func"])),
        makeRuleBody(makeAtom("varAssign", ["var", "intermediateVar", "func"])),
        makeRuleBody(
          makeAtom("taintedWithDiv", ["intermediateVar", "divId", "func"]),
        ),
      ),
    );

    // Simple case: Division expression appears inside the multiply expression.
    // divBeforeMul(mulId, divId, func) :-
    //   divDef(divId, func),
    //   divUsedInMul(mulId, divId, func).
    ctx.add(
      Rule.from(
        [makeAtom("divBeforeMul", ["mulId", "divId", "func"])],
        makeRuleBody(makeAtom("divDef", ["divId", "func"])),
        makeRuleBody(makeAtom("divUsedInMul", ["mulId", "divId", "func"])),
      ),
    );

    // Tainted case: Using a variable tainted with division in the multiply expression.
    // taintedVarInMul(var, divId, func) :-
    //   taintedWithDiv(var, _, func),
    //   varUsedInMul(_, var, func).
    ctx.add(
      Rule.from(
        [makeAtom("taintedVarInMul", ["var", "divId", "func"])],
        makeRuleBody(makeAtom("taintedWithDiv", ["var", "divId", "func"])),
        makeRuleBody(makeAtom("varUsedInMul", ["_", "var", "func"])),
      ),
    );

    // The projection rule used to parse output:
    // violated(divId, func) :-
    //   taintedVarInMul(_, divId, func).
    // violated(divId) :-
    //   divBeforeMul(_, divId, func).
    ctx.add(
      Rule.from(
        [makeAtom("violated", ["divId", "func"])],
        makeRuleBody(makeAtom("taintedVarInMul", ["_", "divId", "func"])),
      ),
    );
    ctx.add(
      Rule.from(
        [makeAtom("violated", ["divId", "func"])],
        makeRuleBody(makeAtom("divBeforeMul", ["_", "divId", "func"])),
      ),
    );
  }

  /**
   * Iterates for each binary operation within the node.
   */
  private forEachBinop(node: AstNode, callback: (expr: AstOpBinary) => void) {
    forEachExpression(node, (expr) => {
      if (expr.kind === "op_binary") {
        callback(expr);
      }
    });
  }

  /**
   * Collects all the identifiers used within the node.
   */
  private collectIdentifiers(node: AstNode): string[] {
    const isId = (acc: string[], expr: AstExpression): string[] => {
      if (expr.kind === "id") {
        acc.push(expr.text);
      }
      return acc;
    };
    return foldExpressions(node, [], isId);
  }

  /**
   * Collects facts based on the IR to populate the Souffle program.
   * @param cu The compilation unit containing the CFGs and AST information.
   * @param ctx The Souffle program to which the facts are added.
   */
  private addConstraints(cu: CompilationUnit, ctx: Context<SrcInfo>): void {
    cu.forEachCFG(cu.ast, (cfg: CFG, _: BasicBlock, stmt: AstStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const funName = cfg.name;
      // Collect information about variables definitions and tainted divisions in initializers
      forEachStatement(stmt, (s) => {
        if (s.kind === "statement_let") {
          const varName = s.name.text;
          ctx.addFact("varDef", Fact.from([varName, funName], s.loc));
          this.collectIdentifiers(s.expression).forEach((rhsName) => {
            ctx.addFact(
              "varAssign",
              Fact.from([varName, rhsName, funName], s.loc),
            );
          });
          // Collect taints in the initializers, e.g.: `a = 10 / 3`
          this.forEachBinop(s.expression, (binopExpr) => {
            if (binopExpr.op === "/") {
              const divId = binopExpr.id;
              ctx.addFact(
                "varTaintedWithDiv",
                Fact.from([varName, divId, funName], binopExpr.loc),
              );
            }
          });
        }
      });
      // Collect information about expressions
      this.forEachBinop(stmt, (binopExpr) => {
        if (binopExpr.op === "/") {
          ctx.addFact(
            "divDef",
            Fact.from([binopExpr.id, funName], binopExpr.loc),
          );
        }
        if (binopExpr.op === "*") {
          const mulId = binopExpr.id;
          this.collectIdentifiers(binopExpr).forEach((usedVar) => {
            ctx.addFact(
              "varUsedInMul",
              Fact.from([mulId, usedVar, funName], binopExpr.loc),
            );
          });
          const processBinop = (binOpExpr: AstOpBinary) => {
            if (binOpExpr.op === "/") {
              const divId = binOpExpr.id;
              ctx.addFact(
                "divUsedInMul",
                Fact.from([mulId, divId, funName], binOpExpr.loc),
              );
              this.collectIdentifiers(binOpExpr).forEach((usedVar) => {
                ctx.addFact(
                  "varTaintedWithDiv",
                  Fact.from([usedVar, divId, funName], binOpExpr.loc),
                );
              });
            }
          };
          this.forEachBinop(binopExpr.left, processBinop);
          this.forEachBinop(binopExpr.right, processBinop);
        }
      });
    });
  }
}
