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
import { Detector } from "../detector";
import { CompilationUnit, Node, CFG } from "../../internals/ir";
import { MistiContext } from "../../internals/context";
import { MistiTactError, Severity, makeDocURL } from "../../internals/errors";
import {
  extractPath,
  forEachExpression,
  forEachStatement,
} from "../../internals/tactASTUtil";
import { AstStatement, SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";

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
  check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    // TODO: Extract method for this shared logic
    const souffleCtx = new Context<SrcInfo>(this.id);
    this.addDecls(souffleCtx);
    this.addRules(souffleCtx);
    this.addConstantConstraints(cu, souffleCtx);
    this.addConstraints(cu, souffleCtx);

    const executor = ctx.config.soufflePath
      ? new Executor<SrcInfo>({
          inputDir: ctx.config.soufflePath,
          outputDir: ctx.config.soufflePath,
        })
      : new Executor<SrcInfo>();
    const result = executor.executeSync(souffleCtx);
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
        "Unbounded Loop",
        Severity.MEDIUM,
        fact.data,
        {
          docURL: makeDocURL(this.id),
          suggestion:
            "Consider changing the variable within the loop to ensure it terminates",
          extraDescription:
            "The condition variable doesn't change within the loop",
        },
      );
    });

    return warnings;
  }

  private addDecls(ctx: Context<SrcInfo>): void {
    ctx.add(Relation.from("constDef", [["var", FactType.Symbol]], undefined));
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
        "loopDef",
        [
          ["loopId", FactType.Number],
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
        "loopVarUse",
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
        "unbound",
        [
          ["var", FactType.Symbol],
          ["loopId", FactType.Number],
          ["func", FactType.Symbol],
        ],
        "output",
      ),
    );
  }

  private addRules(ctx: Context<SrcInfo>): void {
    // unbound(var, loopId, func) :-
    //   varDef(var, func),
    //   loopDef(loopId, func),
    //   loopCondDef(var, loopId, func),
    //   !constDef(var)
    //   !loopVarUse(var, loopId, func).
    ctx.add(
      Rule.from(
        [makeAtom("unbound", ["var", "loopId", "func"])],
        makeRuleBody(makeAtom("varDef", ["var", "func"])),
        makeRuleBody(makeAtom("loopDef", ["loopId", "func"])),
        makeRuleBody(makeAtom("loopCondDef", ["var", "loopId", "func"])),
        makeRuleBody(makeAtom("constDef", ["var"]), {
          negated: true,
        }),
        makeRuleBody(makeAtom("loopVarUse", ["var", "loopId", "func"]), {
          negated: true,
        }),
      ),
    );
  }

  /**
   * Generates Souffle facts for constant definitions which should not be reported if used in the loop.
   */
  private addConstantConstraints(
    cu: CompilationUnit,
    ctx: Context<SrcInfo>,
  ): void {
    for (const c of cu.ast.getConstants({ includeStdlib: true })) {
      ctx.addFact("constDef", Fact.from([c.name.text], c.loc));
    }
  }

  /**
   * Collects facts based on the IR to populate the Souffle program.
   * @param cu The compilation unit containing the CFGs and AST information.
   * @param ctx The Souffle program to which the facts are added.
   */
  private addConstraints(cu: CompilationUnit, ctx: Context<SrcInfo>): void {
    cu.forEachCFG(cu.ast, (cfg: CFG, _: Node, stmt: AstStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const funName = cfg.name;
      if (stmt.kind === "statement_let") {
        ctx.addFact("varDef", Fact.from([stmt.name.text, funName], stmt.loc));
        return;
      }
      if (
        stmt.kind === "statement_while" ||
        stmt.kind === "statement_repeat" ||
        stmt.kind === "statement_until"
      ) {
        const loopId = stmt.id;
        const usedInCond: Set<string> = new Set(); // variables used in the condition
        ctx.addFact("loopDef", Fact.from([loopId, funName], stmt.loc));
        const condition =
          stmt.kind === "statement_repeat" ? stmt.iterations : stmt.condition;
        forEachExpression(condition, (expr) => {
          if (expr.kind === "id") {
            const varName = expr.text;
            usedInCond.add(varName);
            ctx.addFact(
              "loopCondDef",
              Fact.from([varName, loopId, funName], expr.loc),
            );
          }
        });
        forEachStatement(stmt, (s) => {
          if (
            s.kind === "statement_assign" ||
            s.kind === "statement_augmentedassign"
          ) {
            ctx.addFact(
              "loopVarUse",
              Fact.from([extractPath(s.path), loopId, funName], s.loc),
            );
          } else if (s.kind === "statement_expression") {
            const callExpr = s.expression;
            if (
              callExpr.kind === "method_call" ||
              callExpr.kind === "static_call"
            ) {
              callExpr.args.forEach((a) => {
                forEachExpression(a, (expr) => {
                  if (expr.kind === "id" && usedInCond.has(expr.text)) {
                    ctx.addFact(
                      "loopVarUse",
                      Fact.from([expr.text, loopId, funName], s.loc),
                    );
                  }
                });
              });
            }
          }
        });
      }
    });
  }
}
