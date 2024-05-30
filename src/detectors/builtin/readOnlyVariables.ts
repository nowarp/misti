import {
  ASTStatement,
  ASTRef,
  ASTExpression,
} from "@tact-lang/compiler/dist/grammar/ast";
import { Detector } from "../detector";
import { MistiContext } from "../../internals/context";
import { CompilationUnit, Node, CFG } from "../../internals/ir";
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
import {
  foldExpressions,
  forEachExpression,
} from "../../internals/tactASTUtil";

/**
 * A detector that identifies read-only variables and fields.
 *
 * These variables could typically be replaced with constants to optimize performance.
 * Alternatively, identifying read-only variables may reveal issues where unused values are being replaced unintentionally.
 */
export class ReadOnlyVariables extends Detector {
  check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    const program = new Context<ASTRef>(this.id);
    this.addDecls(program);
    this.addRules(program);
    this.addConstraints(cu, program);

    const executor = ctx.config.soufflePath
      ? new Executor<ASTRef>({
          inputDir: ctx.config.soufflePath,
          outputDir: ctx.config.soufflePath,
        })
      : new Executor<ASTRef>();
    const result = executor.executeSync(program);
    if (!result.success) {
      throw new Error(`Error executing Soufflé: ${result.stderr}`);
    }

    const warnings = Array.from(result.results.entries.values()).map((fact) => {
      if (fact.data === undefined) {
        throw new Error(`AST position for fact ${fact} is not available`);
      }
      return createError("Variable is never used", Severity.MEDIUM, fact.data);
    });

    return warnings;
  }

  /**
   * Adds declarations to the Souffle program to represent the properties of variables.
   * @param ctx The Souffle program where the relations are to be added.
   */
  addDecls(ctx: Context<ASTRef>) {
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
  addConstraints(cu: CompilationUnit, ctx: Context<ASTRef>) {
    cu.forEachCFG(cu.ast, (cfg: CFG, _: Node, stmt: ASTStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const funName = cfg.name;
      switch (stmt.kind) {
        case "statement_let":
          ctx.addFact("varDecl", Fact.from([stmt.name, funName], stmt.ref));
          forEachExpression(stmt.expression, (expr: ASTExpression) => {
            if (expr.kind === "id") {
              ctx.addFact("varUse", Fact.from([expr.value, funName], expr.ref));
            }
          });
          break;
        case "statement_assign":
        case "statement_augmentedassign":
          ctx.addFact(
            "varAssign",
            Fact.from([stmt.path[0].name, funName], stmt.ref),
          );
          forEachExpression(stmt.expression, (expr: ASTExpression) => {
            if (expr.kind === "id") {
              ctx.addFact("varUse", Fact.from([expr.value, funName], expr.ref));
            }
          });
          break;
        default:
          forEachExpression(stmt, (expr: ASTExpression) => {
            if (expr.kind === "id") {
              ctx.addFact("varUse", Fact.from([expr.value, funName], stmt.ref));
            }
          });
          break;
      }
    });
  }

  addRules(ctx: Context<ASTRef>) {
    // readOnly(var, func) :-
    //     varDecl(var, func),
    //     varAssign(var, func),
    //     !varUse(var, func).
    ctx.add(
      Rule.from(
        [Atom.from("readOnly", ["var", "func"])],
        RuleBody.from(Atom.from("varDecl", ["var", "func"])),
        RuleBody.from(Atom.from("varAssign", ["var", "func"])),
        RuleBody.from(Atom.from("varUse", ["var", "func"]), { negated: true }),
      ),
    );
    // readOnly(var, func) :-
    //     varDecl(var, func),
    //     !varAssign(var, func),
    //     !varUse(var, func).
    ctx.add(
      Rule.from(
        [Atom.from("readOnly", ["var", "func"])],
        RuleBody.from(Atom.from("varDecl", ["var", "func"])),
        RuleBody.from(Atom.from("varAssign", ["var", "func"]), {
          negated: true,
        }),
        RuleBody.from(Atom.from("varUse", ["var", "func"]), { negated: true }),
      ),
    );
  }
}
