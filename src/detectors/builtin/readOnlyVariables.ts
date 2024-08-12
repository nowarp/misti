import {
  AstStatement,
  SrcInfo,
  AstExpression,
} from "@tact-lang/compiler/dist/grammar/ast";
import { Detector, WarningsBehavior } from "../detector";
import { CompilationUnit, Node, CFG } from "../../internals/ir";
import {
  Context,
  Fact,
  FactType,
  Relation,
  Rule,
  makeRuleBody,
  makeAtom,
} from "../../internals/souffle";
import { MistiTactError, Severity } from "../../internals/errors";
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
 *   // OK: Fixed after the analyzer highlighted this warning
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

  check(cu: CompilationUnit): MistiTactError[] {
    const program = new Context<SrcInfo>(this.id);
    this.addDecls(program);
    this.addRules(program);
    this.addConstraints(cu, program);
    return this.executeSouffle(program, (fact) => {
      if (fact.data === undefined) {
        throw new Error(`AST position for fact ${fact} is not available`);
      }
      if (this.skipUnused(fact.data.contents)) {
        return undefined;
      }
      return this.makeError("Read-only variable", Severity.MEDIUM, fact.data, {
        suggestion: "Consider creating a constant instead",
      });
    });
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
    // XXX: Remove when #69 is implemented.
    ctx.add(
      Relation.from(
        "skip",
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
    const track = (
      funName: string,
      node: AstStatement | AstExpression,
      factName: string,
    ) => {
      forEachExpression(node, (expr: AstExpression) => {
        if (expr.kind === "id") {
          ctx.addFact(factName, Fact.from([expr.text, funName], expr.loc));
        }
      });
    };
    cu.forEachCFG(cu.ast, (cfg: CFG, _: Node, stmt: AstStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const funName = cfg.name;
      switch (stmt.kind) {
        // XXX: Track uses only from conditions and loops.
        //
        // This is done to make the detector less noisy, since until version 1.6.0
        // there are no local constant variables in Tact. This means that the user
        // *wants* to create local read-only let bindings just to name things, and
        // that's the expected code style.
        //
        // See:
        // * https://github.com/nowarp/misti/issues/69
        // * https://github.com/tact-lang/tact/issues/643
        case "statement_condition":
        case "statement_while":
        case "statement_until":
          track(funName, stmt.condition, "varUse");
          break;
        case "statement_repeat":
          track(funName, stmt.iterations, "varUse");
          break;

        // XXX: When the variable appears in any other case, it won't be reported.
        // This will changed fixed when #69 is implemented.
        case "statement_let":
          ctx.addFact(
            "varDecl",
            Fact.from([stmt.name.text, funName], stmt.name.loc),
          );
          track(funName, stmt.expression, "skip");
          break;
        case "statement_assign":
        case "statement_augmentedassign":
          ctx.addFact(
            "varAssign",
            Fact.from([extractPath(stmt.path), funName], stmt.loc),
          );
          track(funName, stmt.expression, "skip");
          break;
        default:
          track(funName, stmt, "skip");
          break;
      }
    });
  }

  addRules(ctx: Context<SrcInfo>) {
    // readOnly(var, func) :-
    //     varDecl(var, func),
    //     varUse(var, func),
    //     !varAssign(var, func),
    //     !skip(var, func).
    ctx.add(
      Rule.from(
        [makeAtom("readOnly", ["var", "func"])],
        makeRuleBody(makeAtom("varDecl", ["var", "func"])),
        makeRuleBody(makeAtom("varUse", ["var", "func"])),
        makeRuleBody(makeAtom("varAssign", ["var", "func"]), {
          negated: true,
        }),
        makeRuleBody(makeAtom("skip", ["var", "func"]), {
          negated: true,
        }),
      ),
    );
  }
}
