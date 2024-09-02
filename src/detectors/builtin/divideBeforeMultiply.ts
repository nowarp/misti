import { SouffleDetector } from "../detector";
import { CompilationUnit, BasicBlock, CFG } from "../../internals/ir";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import {
  forEachExpression,
  forEachStatement,
  foldExpressions,
} from "../../internals/tactASTUtil";
import { SouffleContext, atom, rule, body, relation } from "@nowarp/souffle";
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
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const program = this.createSouffleContext(cu);
    this.addDecls(program);
    this.addRules(program);
    this.addConstraints(cu, program);
    return await this.executeSouffle(program, (fact) => {
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

  private addDecls(ctx: SouffleContext<SrcInfo>): void {
    ctx.add(
      relation(
        "divDef",
        [
          ["divId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
        "Division expression definition.",
      ),
    );
    ctx.add(
      relation(
        "divUsedInMul",
        [
          ["mulId", "Number"],
          ["divId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
        "Division expressions defined within the multiplication expression (both lhs or rhs).",
      ),
    );
    ctx.add(
      relation(
        "varDef",
        [
          ["var", "Symbol"],
          ["func", "Symbol"],
        ],
        undefined,
        "Local variable definition.",
      ),
    );
    ctx.add(
      relation(
        "varTaintedWithDiv",
        [
          ["var", "Symbol"],
          ["divId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
        [
          "Describes variables appearing in the division expression or assigning to a result of the division.",
          "Examples:",
          "* `10 / a` or `a / 10` will create a fact `varTaintedWithDiv(a, <id>)`",
          "* `let a: Int = 10 / 3;` will create a fact `varTaintedWithDiv(a, <id>)` as well",
        ],
      ),
    );
    ctx.add(
      relation(
        "varUsedInMul",
        [
          ["mulId", "Number"],
          ["var", "Symbol"],
          ["func", "Symbol"],
        ],
        undefined,
        [
          "Describes variables appearing in the multiply expression.",
          "For example: `a * 3` or `3 + (a * 4)` will create a fact `varUsedInMul(a, <id>)`.",
        ],
      ),
    );
    ctx.add(
      relation(
        "varAssign",
        [
          ["assigned", "Symbol"],
          ["assignee", "Symbol"],
          ["func", "Symbol"],
        ],
        undefined,
        [
          "Variable assignment to any expression containing another variable used for taint propagation.",
          "For example: `a = (b + 42) - 2` will create a fact: `varAssign(a, b)`.",
        ],
      ),
    );
    ctx.add(
      relation(
        "taintedWithDiv",
        [
          ["var", "Symbol"],
          ["divId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
        "Recursive rule that expresses taint propagation for local variables involved in the division operation.",
      ),
    );
    ctx.add(
      relation(
        "divBeforeMul",
        [
          ["divId", "Number"],
          ["mulId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
        "Main rule: simple case.",
      ),
    );
    ctx.add(
      relation(
        "taintedVarInMul",
        [
          ["var", "Symbol"],
          ["divId", "Number"],
          ["func", "Symbol"],
        ],
        undefined,
        "Main rule: tainted case.",
      ),
    );
    ctx.add(
      relation(
        "violated",
        [
          ["divId", "Number"],
          ["func", "Symbol"],
        ],
        "output",
        "Projection rule to refer the appropriate division operations in the output",
      ),
    );
  }

  private addRules(ctx: SouffleContext<SrcInfo>): void {
    ctx.add(
      rule(
        [atom("taintedWithDiv", ["var", "divId", "func"])],
        [
          body(atom("varDef", ["var", "func"])),
          body(atom("divDef", ["divId", "func"])),
          body(atom("varTaintedWithDiv", ["var", "divId", "func"])),
        ],
        [
          "Base case: direct tainting with division. For example:",
          "```",
          "let a: Int = 10 / 3;",
          "a * 5;",
          "```",
        ],
      ),
    );
    ctx.add(
      rule(
        [atom("taintedWithDiv", ["var", "divId", "func"])],
        [
          body(atom("varDef", ["var", "func"])),
          body(atom("varDef", ["intermediateVar", "func"])),
          body(atom("varAssign", ["var", "intermediateVar", "func"])),
          body(atom("taintedWithDiv", ["intermediateVar", "divId", "func"])),
        ],
        "Indirect tainting through another tainted variable.",
      ),
    );
    ctx.add(
      rule(
        [atom("divBeforeMul", ["mulId", "divId", "func"])],
        [
          body(atom("divDef", ["divId", "func"])),
          body(atom("divUsedInMul", ["mulId", "divId", "func"])),
        ],
        "Simple case: Division expression appears inside the multiply expression.",
      ),
    );
    ctx.add(
      rule(
        [atom("taintedVarInMul", ["var", "divId", "func"])],
        [
          body(atom("taintedWithDiv", ["var", "divId", "func"])),
          body(atom("varUsedInMul", ["_", "var", "func"])),
        ],
        "Tainted case: Using a variable tainted with division in the multiply expression.",
      ),
    );
    ctx.add(
      rule(
        [atom("violated", ["divId", "func"])],
        [body(atom("taintedVarInMul", ["_", "divId", "func"]))],
        "The projection rule used to parse output",
      ),
    );
    ctx.add(
      rule(
        [atom("violated", ["divId", "func"])],
        [body(atom("divBeforeMul", ["_", "divId", "func"]))],
        "The projection rule used to parse output",
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
  private addConstraints(
    cu: CompilationUnit,
    ctx: SouffleContext<SrcInfo>,
  ): void {
    cu.forEachCFG(cu.ast, (cfg: CFG, _: BasicBlock, stmt: AstStatement) => {
      if (cfg.origin === "stdlib") {
        return;
      }
      const funName = cfg.name;
      // Collect information about variables definitions and tainted divisions in initializers
      forEachStatement(stmt, (s) => {
        if (s.kind === "statement_let") {
          const varName = s.name.text;
          ctx.addFact("varDef", [varName, funName], s.loc);
          this.collectIdentifiers(s.expression).forEach((rhsName) => {
            ctx.addFact("varAssign", [varName, rhsName, funName], s.loc);
          });
          // Collect taints in the initializers, e.g.: `a = 10 / 3`
          this.forEachBinop(s.expression, (binopExpr) => {
            if (binopExpr.op === "/") {
              const divId = binopExpr.id;
              ctx.addFact(
                "varTaintedWithDiv",
                [varName, divId, funName],
                binopExpr.loc,
              );
            }
          });
        }
      });
      // Collect information about expressions
      this.forEachBinop(stmt, (binopExpr) => {
        if (binopExpr.op === "/") {
          ctx.addFact("divDef", [binopExpr.id, funName], binopExpr.loc);
        }
        if (binopExpr.op === "*") {
          const mulId = binopExpr.id;
          this.collectIdentifiers(binopExpr).forEach((usedVar) => {
            ctx.addFact(
              "varUsedInMul",
              [mulId, usedVar, funName],
              binopExpr.loc,
            );
          });
          const processBinop = (binOpExpr: AstOpBinary) => {
            if (binOpExpr.op === "/") {
              const divId = binOpExpr.id;
              ctx.addFact(
                "divUsedInMul",
                [mulId, divId, funName],
                binOpExpr.loc,
              );
              this.collectIdentifiers(binOpExpr).forEach((usedVar) => {
                ctx.addFact(
                  "varTaintedWithDiv",
                  [usedVar, divId, funName],
                  binOpExpr.loc,
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
