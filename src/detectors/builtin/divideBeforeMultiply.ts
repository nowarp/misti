import {
  ASTStatement,
  ASTRef,
  ASTNode,
  ASTExpression,
  ASTOpBinary,
} from "@tact-lang/compiler/dist/grammar/ast";
import {
  Context,
  Fact,
  FactType,
  Relation,
  Executor,
  makeAtom,
  makeRuleBody,
  Rule,
  makeBinConstraint,
} from "../../internals/souffle";
import { Detector } from "../detector";
import { CompilationUnit, Node, CFG } from "../../internals/ir";
import { MistiContext } from "../../internals/context";
import { createError, MistiTactError, Severity } from "../../internals/errors";
import {
  forEachExpression,
  foldExpressions,
  forEachStatement,
} from "../../internals/tactASTUtil";

/**
 * A detector that identifies and corrects instances of division before multiplication to
 * ensure accurate mathematical operations.
 *
 * ## Why is it bad?
 * Performing division before multiplication can lead to unexpected results due to precision loss and rounding errors:
 * * Precision Loss: Dividing first can result in significant precision loss, especially when dealing with integers or fixed-point numbers.
 * * Rounding Errors: Early division might cause rounding errors that propagate through subsequent calculations.
 * * Unexpected Behavior: Misordered operations can lead to incorrect outcomes, making debugging and maintenance more challenging.
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
export class DivideBeforeMultiply extends Detector {
  check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    // TODO: Extract method for this shared logic
    const souffleCtx = new Context<ASTRef>(this.id);
    this.addDecls(souffleCtx);
    this.addRules(souffleCtx);
    this.addConstraints(cu, souffleCtx);

    const executor = ctx.config.soufflePath
      ? new Executor<ASTRef>({
          inputDir: ctx.config.soufflePath,
          outputDir: ctx.config.soufflePath,
        })
      : new Executor<ASTRef>();
    const result = executor.executeSync(souffleCtx);
    if (!result.success) {
      throw new Error(`Error executing Soufflé: ${result.stderr}`);
    }

    const warnings = Array.from(result.results.entries.values()).map((fact) => {
      if (fact.data === undefined) {
        throw new Error(`AST position for fact ${fact} is not available`);
      }
      return createError(
        "Division operation before multiplication detected. Consider rearranging the operations.",
        Severity.HIGH,
        fact.data,
      );
    });

    return warnings;
  }

  private addDecls(ctx: Context<ASTRef>): void {
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
          ["asigneed", FactType.Symbol],
          ["asignee", FactType.Symbol],
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

    // Main rule declaration: simple case.
    ctx.add(
      Relation.from(
        "divBeforeMul",
        [
          ["divId", FactType.Number],
          ["mulId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        "output",
      ),
    );
    // Main rule reclaration: tainted case.
    ctx.add(
      Relation.from(
        "taintedVarInMul",
        [
          ["var", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        "output",
      ),
    );
  }

  private addRules(ctx: Context<ASTRef>): void {
    // NOTE: We leverage the observation that Tact AST elements have IDs that increase
    // according to their point of definition. Therefore, if divide was defined after
    // multiplication, its ID value will be larger.
    // TODO: That's an additional check, do we really need it?

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
    // taintedVarInMul(var, func) :-
    //   taintedWithDiv(var, _, func),
    //   varUsedInMul(_, var, func).
    ctx.add(
      Rule.from(
        [makeAtom("taintedVarInMul", ["var", "func"])],
        makeRuleBody(makeAtom("taintedWithDiv", ["var", "_", "func"])),
        makeRuleBody(makeAtom("varUsedInMul", ["_", "var", "func"])),
      ),
    );
  }

  /**
   * Iterates for each binary operation within the node.
   */
  private forEachBinop(node: ASTNode, callback: (expr: ASTOpBinary) => void) {
    forEachExpression(node, (expr) => {
      if (expr.kind === "op_binary") {
        callback(expr);
      }
    });
  }

  /**
   * Collects all the identifiers used within the node.
   */
  private collectIdentifiers(node: ASTNode): string[] {
    const isId = (acc: string[], expr: ASTExpression): string[] => {
      if (expr.kind === "id") {
        acc.push(expr.value);
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
  private addConstraints(cu: CompilationUnit, ctx: Context<ASTRef>): void {
    cu.forEachCFG(cu.ast, (cfg: CFG, _: Node, stmt: ASTStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const funName = cfg.name;
      // Collect information about variables definitions and tainted divisions in initializers
      forEachStatement(stmt, (s) => {
        if (s.kind === "statement_let") {
          const varName = s.name;
          ctx.addFact("varDef", Fact.from([varName, funName], s.ref));
          this.collectIdentifiers(s.expression).forEach((rhsName) => {
            ctx.addFact(
              "varAssign",
              Fact.from([varName, rhsName, funName], s.ref),
            );
          });
          // Collect taints in the initializers, e.g.: `a = 10 / 3`
          this.forEachBinop(s.expression, (binopExpr) => {
            if (binopExpr.op === "/") {
              const divId = binopExpr.id;
              ctx.addFact(
                "varTaintedWithDiv",
                Fact.from([varName, divId, funName], binopExpr.ref),
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
            Fact.from([binopExpr.id, funName], binopExpr.ref),
          );
        }
        if (binopExpr.op === "*") {
          const mulId = binopExpr.id;
          this.collectIdentifiers(binopExpr).forEach((usedVar) => {
            ctx.addFact(
              "varUsedInMul",
              Fact.from([mulId, usedVar, funName], binopExpr.ref),
            );
          });
          const processBinop = (binOpExpr: ASTOpBinary) => {
            if (binOpExpr.op === "/") {
              const divId = binOpExpr.id;
              ctx.addFact(
                "divUsedInMul",
                Fact.from([mulId, divId, funName], binOpExpr.ref),
              );
              this.collectIdentifiers(binOpExpr).forEach((usedVar) => {
                ctx.addFact(
                  "varTaintedWithDiv",
                  Fact.from([usedVar, divId, funName], binOpExpr.ref),
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
