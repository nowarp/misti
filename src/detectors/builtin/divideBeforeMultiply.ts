import { ASTStatement, ASTRef } from "@tact-lang/compiler/dist/grammar/ast";
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
    // TODO: Add constants and fields
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
    ctx.add(
      Relation.from(
        "divOpDef",
        [
          ["divId", FactType.Number],
          ["lhs", FactType.Symbol],
          ["rhs", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    ctx.add(
      Relation.from(
        "mulOpDef",
        [
          ["mulId", FactType.Number],
          ["lhs", FactType.Symbol],
          ["rhs", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    ctx.add(
      Relation.from(
        "loopCondDef",
        [
          ["var", FactType.Symbol],
          ["loopId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    ctx.add(
      Relation.from(
        "divBeforeMul",
        [
          ["var", FactType.Symbol],
          ["divId", FactType.Number],
          ["mulId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        "output",
      ),
    );
  }

  private addRules(ctx: Context<ASTRef>): void {
    // divBeforeMul(var, divId, mulId, func) :-
    //   varDef(var, func),
    //   divOpDef(divId, var, _, func),
    //   mulOpDef(mulId, var, _, func),
    //   divId < mulId.
    ctx.add(
      Rule.from(
        [makeAtom("divBeforeMul", ["var", "divId", "mulId", "func"])],
        makeRuleBody(makeAtom("varDef", ["var", "func"])),
        makeRuleBody(makeAtom("divOpDef", ["divId", "var", "_", "func"])),
        makeRuleBody(makeAtom("mulOpDef", ["mulId", "var", "_", "func"])),
        makeRuleBody(makeBinConstraint("divId", "<", "mulId")),
      ),
    );
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
    });
  }
}
