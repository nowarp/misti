import { InternalException } from "../../internals/exceptions";
import { BasicBlock, CFG, CompilationUnit } from "../../internals/ir";
import { extractPath, forEachExpression } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { SouffleDetector, WarningsBehavior } from "../detector";
import { SouffleContext, atom, body, relation, rule } from "@nowarp/souffle";
import {
  AstExpression,
  AstStatement,
  SrcInfo,
} from "@tact-lang/compiler/dist/grammar/ast";

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
export class ReadOnlyVariables extends SouffleDetector {
  severity = Severity.MEDIUM;

  get shareImportedWarnings(): WarningsBehavior {
    // Read-only constants/fields from imported files will be reported iff they
    // are reported in each of the projects (CompilationUnit).
    return "intersect";
  }

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const program = this.createSouffleContext(cu);
    this.addDecls(program);
    this.addRules(program);
    this.addConstraints(cu, program);
    return await this.executeSouffle(program, (fact) => {
      if (fact.data === undefined) {
        throw InternalException.make(
          `AST position for fact ${fact} is not available`,
        );
      }
      if (this.skipUnused(fact.data.contents)) {
        return undefined;
      }
      return this.makeWarning("Read-only variable", fact.data, {
        suggestion: "Consider creating a constant instead",
      });
    });
  }

  /**
   * Adds declarations to the Souffle program to represent the properties of variables.
   * @param ctx The Souffle program where the relations are to be added.
   */
  addDecls(ctx: SouffleContext<SrcInfo>) {
    ctx.add(
      relation("varDecl", [
        ["var", "Symbol"],
        ["func", "Symbol"],
      ]),
    );
    ctx.add(
      relation("varAssign", [
        ["var", "Symbol"],
        ["func", "Symbol"],
      ]),
    );
    ctx.add(
      relation("varUse", [
        ["var", "Symbol"],
        ["func", "Symbol"],
      ]),
    );
    // XXX: Remove when #69 is implemented.
    ctx.add(
      relation("skip", [
        ["var", "Symbol"],
        ["func", "Symbol"],
      ]),
    );
    ctx.add(
      relation(
        "readOnly",
        [
          ["var", "Symbol"],
          ["func", "Symbol"],
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
  addConstraints(cu: CompilationUnit, ctx: SouffleContext<SrcInfo>) {
    const track = (
      funName: string,
      node: AstStatement | AstExpression,
      factName: string,
    ) => {
      forEachExpression(node, (expr: AstExpression) => {
        if (expr.kind === "id") {
          ctx.addFact(factName, [expr.text, funName], expr.loc);
        }
      });
    };
    cu.forEachBasicBlock(
      cu.ast,
      (cfg: CFG, _: BasicBlock, stmt: AstStatement) => {
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
            ctx.addFact("varDecl", [stmt.name.text, funName], stmt.name.loc);
            track(funName, stmt.expression, "skip");
            break;
          case "statement_assign":
          case "statement_augmentedassign":
            ctx.addFact(
              "varAssign",
              [extractPath(stmt.path), funName],
              stmt.loc,
            );
            track(funName, stmt.expression, "skip");
            break;
          default:
            track(funName, stmt, "skip");
            break;
        }
      },
    );
  }

  addRules(ctx: SouffleContext<SrcInfo>) {
    // readOnly(var, func) :-
    //     varDecl(var, func),
    //     varUse(var, func),
    //     !varAssign(var, func),
    //     !skip(var, func).
    ctx.add(
      rule(
        [atom("readOnly", ["var", "func"])],
        [
          body(atom("varDecl", ["var", "func"])),
          body(atom("varUse", ["var", "func"])),
          body(atom("varAssign", ["var", "func"]), {
            negated: true,
          }),
          body(atom("skip", ["var", "func"]), {
            negated: true,
          }),
        ],
      ),
    );
  }
}
