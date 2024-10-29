import { CompilationUnit } from "../../internals/ir";
import {
  evalsToValue,
  foldStatements,
  forEachExpression,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import { AstExpression } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that suggests optimizing boolean expressions to leverage short-circuit evaluation.
 *
 * ## Why is it bad?
 * TVM supports short-circuit operations. When using logical AND (`&&`) or logical OR (`||`) operations,
 * placing constant or cheaper conditions first can prevent unnecessary execution
 * of expensive operations when the result is already determined.
 *
 * ## Example
 * ```tact
 * // Bad: Expensive operation is always executed
 * if (expensive_function() && constant_false) {
 *   // ...
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * // Good: Expensive operation is skipped when constant_false is false
 * if (constant_false && expensive_function()) {
 *   // ...
 * }
 * ```
 */
export class ShortCircuitCondition extends ASTDetector {
  severity = Severity.LOW;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return Array.from(cu.ast.getFunctions()).reduce(
      (acc, fun) => acc.concat(this.checkFunction(fun)),
      [] as MistiTactWarning[],
    );
  }

  private checkFunction(fun: any): MistiTactWarning[] {
    return foldStatements(
      fun,
      (acc, stmt) => {
        forEachExpression(stmt, (expr) => {
          if (
            expr.kind === "op_binary" &&
            (expr.op === "&&" || expr.op === "||")
          ) {
            const leftConst = this.isConstantExpression(expr.left);
            const rightConst = this.isConstantExpression(expr.right);
            const leftExpensive = this.containsExpensiveCall(expr.left);
            const rightExpensive = this.containsExpensiveCall(expr.right);
            if (
              expr.op === "&&" &&
              leftExpensive &&
              !rightExpensive &&
              !leftConst &&
              !rightConst
            ) {
              acc.push(
                this.makeWarning(
                  `Consider reordering: Move expensive function call to the end.`,
                  expr.loc,
                  {
                    suggestion: `Place cheaper conditions on the left to leverage short-circuiting.`,
                  },
                ),
              );
            } else if (
              expr.op === "||" &&
              leftExpensive &&
              !rightExpensive &&
              !leftConst &&
              !rightConst
            ) {
              acc.push(
                this.makeWarning(
                  `Consider reordering: Move expensive function call to the end.`,
                  expr.loc,
                  {
                    suggestion: `Place cheaper conditions on the left to leverage short-circuiting.`,
                  },
                ),
              );
            } else if (
              (expr.op === "&&" && !leftConst && rightConst) ||
              (expr.op === "||" && leftConst && !rightConst)
            ) {
              acc.push(
                this.makeWarning(
                  `Consider reordering: Move constant to the left.`,
                  expr.loc,
                  {
                    suggestion: `Reorder to optimize ${expr.op} condition short-circuiting`,
                  },
                ),
              );
            }
          }
        });
        return acc;
      },
      [] as MistiTactWarning[],
    );
  }

  private containsExpensiveCall(expr: AstExpression): boolean {
    let isExpensive = false;
    const checkExpensive = (e: AstExpression) => {
      // Early exit if found
      if (isExpensive) return;
      if (e.kind === "method_call" || e.kind === "static_call") {
        isExpensive = true;
      } else if (e.kind === "op_binary") {
        checkExpensive(e.left);
        checkExpensive(e.right);
      } else if (e.kind === "op_unary") {
        checkExpensive(e.operand);
      } else if (e.kind === "field_access") {
        checkExpensive(e.aggregate);
      } else if (e.kind === "conditional") {
        checkExpensive(e.condition);
        checkExpensive(e.thenBranch);
        checkExpensive(e.elseBranch);
      } else if (e.kind === "struct_instance") {
        e.args.forEach((arg) => {
          checkExpensive(arg.initializer);
        });
      } else if (e.kind === "init_of") {
        e.args.forEach((arg) => {
          checkExpensive(arg);
        });
      }
    };
    checkExpensive(expr);
    return isExpensive;
  }

  private isConstantExpression(expr: AstExpression): boolean {
    if (
      evalsToValue(expr, "boolean", true) ||
      evalsToValue(expr, "boolean", false) ||
      expr.kind === "boolean"
    ) {
      return true;
    }
    if (
      expr.kind === "number" ||
      expr.kind === "string" ||
      expr.kind === "null"
    ) {
      return true;
    }
    if (
      expr.kind === "op_binary" &&
      ["==", "!=", ">", "<", ">=", "<="].includes(expr.op)
    ) {
      return (
        this.isConstantExpression(expr.left) &&
        this.isConstantExpression(expr.right)
      );
    }
    return false;
  }
}
