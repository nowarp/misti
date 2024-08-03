import {
  AstStatement,
  SrcInfo,
  AstExpression,
} from "@tact-lang/compiler/dist/grammar/ast";
import { Detector, WarningsBehavior } from "../detector";
import { MistiContext } from "../../internals/context";
import { CompilationUnit, Node, CFG } from "../../internals/ir";
import {
  Context,
  Fact,
  FactType,
  Relation,
  Executor,
  Rule,
  makeRuleBody,
  makeAtom,
} from "../../internals/souffle";
import { MistiTactError, Severity, makeDocURL } from "../../internals/errors";
import { extractPath, forEachExpression } from "../../internals/tactASTUtil";

/**
 * A detector that identifies read-only variables and fields.
 *
 * ## Why is it bad?
 * These variables could typically be replaced with constants to optimize performance.
 * Alternatively, identifying read-only variables may reveal issues where unused values are being replaced unintentionally.
 *
 * ## Example
 * ```tact
 * fun calculateFinalPrice(price: Int): Int {
 *   // Warning: the developer uses a read-only variable that could be a constant
 *   let DISCOUNT_AMOUNT: Int = 10;
 *   return price - DISCOUNT_AMOUNT;
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * const DISCOUNT_AMOUNT: Int = 10;
 *
 * fun calculateFinalPrice(price: Int): Int {
 *   // OK: Fixed after the linter highlighted this warning
 *   return price - DISCOUNT_AMOUNT;
 * }
 * ```
 */
export class ReadOnlyVariables extends Detector {
  get shareImportedWarnings(): WarningsBehavior {
    // Read-only constants/fields from imported files will be reported iff they
    // are reported in each of the projects (CompilationUnit).
    return "intersect";
  }

  check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    const program = new Context<SrcInfo>(this.id);
    this.addDecls(program);
    this.addRules(program);
    this.addConstraints(cu, program);

    const executor = ctx.config.soufflePath
      ? new Executor<SrcInfo>({
          inputDir: ctx.config.soufflePath,
          outputDir: ctx.config.soufflePath,
        })
      : new Executor<SrcInfo>();
    const result = executor.executeSync(program);
    if (!result.success) {
      throw new Error(
        `Error executing Soufflé for ${this.id}:\n${result.stderr}`,
      );
    }

    const warnings = Array.from(result.results.entries.values()).map((fact) => {
      if (fact.data === undefined) {
        throw new Error(`AST position for fact ${fact} is not available`);
      }
      return MistiTactError.make(
        ctx,
        this.id,
        "Read-only variable",
        Severity.MEDIUM,
        fact.data,
        {
          docURL: makeDocURL(this.id),
          suggestion: "Consider creating a constant instead",
        },
      );
    });

    return warnings;
  }

  /**
   * Adds declarations to the Souffle program to represent the properties of variables.
   * @param ctx The Souffle program where the relations are to be added.
   */
  addDecls(ctx: Context<SrcInfo>) {
    ctx.add(
      Relation.from(
        "varDecl",
        [
          ["var", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    ctx.add(
      Relation.from(
        "varAssign",
        [
          ["var", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    ctx.add(
      Relation.from(
        "varUse",
        [
          ["var", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        undefined,
      ),
    );
    ctx.add(
      Relation.from(
        "readOnly",
        [
          ["var", FactType.Symbol],
          ["func", FactType.Symbol],
        ],
        "output",
      ),
    );
  }

  /**
   * Collects facts based on the IR to populate the Souffle program.
   * @param cu The compilation unit containing the CFGs and AST information.
   * @param ctx The Souffle program to which the facts are added.
   */
  addConstraints(cu: CompilationUnit, ctx: Context<SrcInfo>) {
    const addUses = (funName: string, node: AstStatement | AstExpression) => {
      forEachExpression(node, (expr: AstExpression) => {
        if (expr.kind === "id") {
          ctx.addFact("varUse", Fact.from([expr.text, funName], expr.loc));
        }
      });
    };
    cu.forEachCFG(cu.ast, (cfg: CFG, _: Node, stmt: AstStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const funName = cfg.name;
      switch (stmt.kind) {
        case "statement_let":
          ctx.addFact(
            "varDecl",
            Fact.from([stmt.name.text, funName], stmt.loc),
          );
          addUses(funName, stmt.expression);
          break;
        case "statement_assign":
        case "statement_augmentedassign":
          ctx.addFact(
            "varAssign",
            Fact.from([extractPath(stmt.path), funName], stmt.loc),
          );
          addUses(funName, stmt.expression);
          break;
        default:
          addUses(funName, stmt);
          break;
      }
    });
  }

  addRules(ctx: Context<SrcInfo>) {
    // readOnly(var, func) :-
    //     varDecl(var, func),
    //     !varAssign(var, func),
    //     !varUse(var, func).
    ctx.add(
      Rule.from(
        [makeAtom("readOnly", ["var", "func"])],
        makeRuleBody(makeAtom("varDecl", ["var", "func"])),
        makeRuleBody(makeAtom("varAssign", ["var", "func"]), {
          negated: true,
        }),
        makeRuleBody(makeAtom("varUse", ["var", "func"]), { negated: true }),
      ),
    );
  }
}
