import { InternalException } from "../../internals/exceptions";
import { BasicBlock, CFG, CompilationUnit } from "../../internals/ir";
import {
  extractPath,
  forEachExpression,
  forEachStatement,
} from "../../internals/tactASTUtil";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { SouffleDetector } from "../detector";
import { SouffleContext, atom, body, relation, rule } from "@nowarp/souffle";
import {
  AstId,
  AstStatement,
  SrcInfo,
  isValue,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that analyzes loop conditions and control flow to ensure loops have proper termination criteria.
 *
 * ## Why is it bad?
 * An unbounded loop can be problematic for several reasons:
 * * **Unexpected Behavior:** Without a defined termination, loops can lead to unpredictable contract behavior and make debugging difficult.
 * * **Out-of-gas Attacks:** Continuous looping without termination can lead to out-of-gas attacks.
 * * **DoS Attacks:** Malicious actors can exploit unbounded loops to create denial-of-service attacks, impacting contract's availability.
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
export class UnboundLoops extends SouffleDetector {
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const program = this.createSouffleContext(cu);
    this.addDecls(program);
    this.addRules(program);
    this.addConstantConstraints(cu, program);
    this.addConstraints(cu, program);
    return await this.executeSouffle(program, (fact) => {
      if (fact.data === undefined) {
        throw InternalException.make(
          `AST position for fact ${fact} is not available`,
        );
      }
      return this.makeWarning(
        "Found unbounded loop",
        Severity.HIGH,
        fact.data,
        {
          suggestion:
            "Consider changing the variable inside the loop to ensure it terminates",
          extraDescription:
            "The condition variable doesn't change inside the loop",
        },
      );
    });
  }

  private addDecls(ctx: SouffleContext<SrcInfo>): void {
    ctx.add(relation("constDef", [["var", "Symbol"]], undefined));
    ctx.add(
      relation(
        "varDef",
        [
          ["var", "Symbol"],
          ["func", "Symbol"],
        ],
        undefined,
      ),
    );
    ctx.add(
      relation(
        "loopDef",
        [
          ["loopId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
      ),
    );
    ctx.add(
      relation(
        "loopCondDef",
        [
          ["var", "Symbol"],
          ["loopId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
      ),
    );
    ctx.add(
      relation(
        "loopVarUse",
        [
          ["var", "Symbol"],
          ["loopId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
      ),
    );
    ctx.add(
      relation(
        "unbound",
        [
          ["var", "Symbol"],
          ["loopId", "Number"],
          ["func", "Symbol"],
        ],
        "output",
      ),
    );
  }

  private addRules(ctx: SouffleContext<SrcInfo>): void {
    // unbound(var, loopId, func) :-
    //   varDef(var, func),
    //   loopDef(loopId, func),
    //   loopCondDef(var, loopId, func),
    //   !constDef(var)
    //   !loopVarUse(var, loopId, func).
    ctx.add(
      rule(
        [atom("unbound", ["var", "loopId", "func"])],
        [
          body(atom("varDef", ["var", "func"])),
          body(atom("loopDef", ["loopId", "func"])),
          body(atom("loopCondDef", ["var", "loopId", "func"])),
          body(atom("constDef", ["var"]), {
            negated: true,
          }),
          body(atom("loopVarUse", ["var", "loopId", "func"]), {
            negated: true,
          }),
        ],
      ),
    );
  }

  /**
   * Generates Souffle facts for constant definitions which should not be reported if used in the loop.
   */
  private addConstantConstraints(
    cu: CompilationUnit,
    ctx: SouffleContext<SrcInfo>,
  ): void {
    for (const c of cu.ast.getConstants({ includeStdlib: true })) {
      ctx.addFact("constDef", [c.name.text], c.loc);
    }
  }

  /**
   * Collects facts based on the IR to populate the Souffle program.
   * @param cu The compilation unit containing the CFGs and AST information.
   * @param ctx The Souffle program to which the facts are added.
   */
  private addConstraints(
    cu: CompilationUnit,
    ctx: SouffleContext<SrcInfo>,
  ): void {
    cu.forEachBasicBlock(
      cu.ast,
      (cfg: CFG, _: BasicBlock, stmt: AstStatement) => {
        if (cfg.origin === "stdlib") {
          return;
        }
        const funName = cfg.name;
        if (stmt.kind === "statement_let") {
          ctx.addFact("varDef", [stmt.name.text, funName], stmt.loc);
          return;
        }
        if (
          stmt.kind === "statement_while" ||
          stmt.kind === "statement_until"
        ) {
          const loopId = stmt.id;
          const usedInCond: Set<string> = new Set(); // variables used in the condition
          ctx.addFact("loopDef", [loopId, funName], stmt.loc);
          const add = (id: AstId) => {
            usedInCond.add(id.text);
            ctx.addFact("loopCondDef", [id.text, loopId, funName], id.loc);
          };
          const cond = stmt.condition;
          // TODO: This could be improved using the constant evaluator when
          // available in the compiler API: #71
          if (cond.kind === "id") {
            // e.g.: while(a)
            add(cond);
          } else if (cond.kind === "op_unary" && cond.operand.kind === "id") {
            // e.g.: while(!a)
            add(cond.operand);
          } else if (
            cond.kind === "op_binary" &&
            cond.left.kind === "id" &&
            isValue(cond.right)
          ) {
            // e.g.: while(a < 10)
            add(cond.left);
          } else if (
            cond.kind === "op_binary" &&
            cond.right.kind === "id" &&
            isValue(cond.left)
          ) {
            // e.g.: while(10 > a)
            add(cond.right);
          }
          forEachStatement(stmt, (s) => {
            if (
              s.kind === "statement_assign" ||
              s.kind === "statement_augmentedassign"
            ) {
              ctx.addFact(
                "loopVarUse",
                [extractPath(s.path), loopId, funName],
                s.loc,
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
                        [expr.text, loopId, funName],
                        s.loc,
                      );
                    }
                  });
                });
              }
            }
          });
        }
      },
    );
  }
}
