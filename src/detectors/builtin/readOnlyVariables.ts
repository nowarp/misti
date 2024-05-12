import { ASTStatement } from "@tact-lang/compiler/dist/grammar/ast";
import { Detector } from "../detector";
import { MistiContext } from "../../internals/context";
import { CompilationUnit, Node, CFG } from "../../internals/ir";
import {
  SouffleProgram,
  Relation,
  SouffleExecutor,
  Rule,
  RuleBody,
  Atom,
} from "../../internals/souffle";
import { MistiTactError, Severity } from "../../internals/errors";

/**
 * A detector that identifies read-only variables and fields.
 *
 * These variables could typically be replaced with constants to optimize performance.
 * Alternatively, identifying read-only variables may reveal issues where unused values are being replaced unintentionally.
 */
export class ReadOnlyVariables extends Detector {
  get id(): string {
    return "ROV";
  }

  check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    ctx.logger.debug("Checking for read-only variables...");

    const program = new SouffleProgram(this.id);
    this.addDecls(program);
    this.addRules(program);
    this.addConstraints(cu, program);

    const executor = ctx.config.soufflePath
      ? new SouffleExecutor({
          inputDir: ctx.config.soufflePath,
          outputDir: ctx.config.soufflePath,
        })
      : new SouffleExecutor();
    const result = executor.executeSync(program);
    if (!result.success) {
      throw new Error(`Error executing Soufflé: ${result.stderr}`);
    }

    const warnings = Array.from(result.results.entries.values()).map(
      ([_, ref]) =>
        new MistiTactError("Variable is never used", ref, Severity.MEDIUM),
    );

    return warnings;
  }

  /**
   * Adds declarations to the Souffle program to represent the properties of variables.
   * @param program The Souffle program where the relations are to be added.
   */
  addDecls(program: SouffleProgram) {
    program.add(
      Relation.from(
        "varDecl",
        [
          ["var", "symbol"],
          ["func", "symbol"],
        ],
        undefined,
      ),
    );
    program.add(
      Relation.from(
        "varAssign",
        [
          ["var", "symbol"],
          ["func", "symbol"],
        ],
        undefined,
      ),
    );
    program.add(
      Relation.from(
        "varUse",
        [
          ["var", "symbol"],
          ["func", "symbol"],
        ],
        undefined,
      ),
    );
    program.add(
      Relation.from(
        "readOnly",
        [
          ["var", "symbol"],
          ["func", "symbol"],
        ],
        "output",
      ),
    );
  }

  /**
   * Collects facts based on the IR to populate the Souffle program.
   * @param ctx The Misti context containing the logger and configuration.
   * @param cu The compilation unit containing the CFGs and AST information.
   * @param program The Souffle program to which the facts are added.
   */
  addConstraints(cu: CompilationUnit, program: SouffleProgram) {
    cu.forEachCFG(cu.ast, (cfg: CFG, _: Node, stmt: ASTStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const funName = cfg.name;
      switch (stmt.kind) {
        case "statement_let":
          program.addFact("varDecl", [stmt.name, funName], stmt.ref);
          break;
        case "statement_assign":
        case "statement_augmentedassign":
          // NOTE: Variables unpacking is not supported
          program.addFact("varAssign", [stmt.path[0].name, funName], stmt.ref);
          break;
        case "statement_expression":
          // TODO: Other cases?
          if (stmt.expression.kind === "id") {
            program.addFact(
              "varUse",
              [stmt.expression.value, funName],
              stmt.ref,
            );
          }
          break;
        default:
          break;
      }
    });
  }

  addRules(program: SouffleProgram) {
    // readOnly(var, func) :-
    //     varDecl(var, func),
    //     varAssign(var, func),
    //     !varUse(var, func).
    program.add(
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
    program.add(
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
