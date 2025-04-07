import { CompilationUnit } from "../../internals/ir";
import { forEachStatement, isSelf } from "../../internals/tact";
import {
  AstExpression,
  AstStatementExpression,
  AstNode,
  AstType,
} from "../../internals/tact/imports";
import { idText } from "../../internals/tact/imports";
import { prettyPrint } from "../../internals/tact/imports";
import { unreachable } from "../../internals/util";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * Suppressed functions which result typically could be ignored.
 */
const IGNORED_FUNCTIONS = new Set<string>(["send"]);

/**
 * A detector that identifies expression statements whose result is unused.
 *
 * ## Why is it bad?
 * Expression statements that don't alter the contract's state and whose results are not used
 * can lead to inefficiency, dead code, and potential confusion. They add unnecessary complexity
 * without contributing to the logic or state of the contract.
 *
 * ## Example
 * ```tact
 * self.foo == 3; // Warning: unused boolean expression
 * inc(a); // Warning: unused return value
 * ```
 *
 * Use instead:
 * ```tact
 * self.foo = 3; // Fixed: corrected assignment
 * newValue = inc(a); // OK: result is now used
 * let _ = inc(a); // OK: explicitly ignored
 * ```
 */
export class UnusedExpressionResult extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.SECURITY;

  /**
   * Return types that the available free functions have.
   */
  private freeFunctionReturnTypes = new Map<string, AstType | undefined>();

  async check(cu: CompilationUnit): Promise<Warning[]> {
    this.freeFunctionReturnTypes = cu.ast.getReturnTypes();
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      if (node.kind === "trait" || node.kind === "contract") {
        const methodReturnTypes = cu.ast.getMethodReturnTypes(node.id);
        acc = acc.concat(this.checkFunction(node, methodReturnTypes));
      } else if (node.kind === "function_def") {
        acc = acc.concat(this.checkFunction(node, undefined));
      }
      return acc;
    }, [] as Warning[]);
  }

  /**
   * @param methodReturnTypes Return types of methods of the current trait/contract.
   */
  private checkFunction(
    node: AstNode,
    methodReturnTypes: Map<string, AstType | undefined> | undefined,
  ): Warning[] {
    const warnings: Warning[] = [];
    forEachStatement(node, (stmt) => {
      if (stmt.kind === "statement_expression") {
        this.checkExpressionStatement(stmt, methodReturnTypes).forEach((w) =>
          warnings.push(w),
        );
      }
    });
    return warnings;
  }

  /**
   * Generates warnings if `stmt` contains expressions which result is unused.
   * @param methodReturnTypes Return types of methods of the current trait/contract.
   */
  private checkExpressionStatement(
    stmt: AstStatementExpression,
    methodReturnTypes: Map<string, AstType | undefined> | undefined,
  ): Warning[] {
    return this.checkExpression(stmt.expression, methodReturnTypes);
  }

  /**
   * @param methodReturnTypes Return types of methods of the current trait/contract.
   */
  private checkExpression(
    expr: AstExpression,
    methodReturnTypes: Map<string, AstType | undefined> | undefined,
  ): Warning[] {
    const warnings: Warning[] = [];
    const warn = () =>
      this.makeWarning(
        `Result of evaluation of ${prettyPrint(expr)} is unused`,
        expr.loc,
        {
          suggestion: "Remove the expression or assign its result",
        },
      );
    switch (expr.kind) {
      case "struct_instance":
      case "struct_value":
      case "init_of":
      case "code_of":
        break; // do nothing
      case "op_binary":
      case "op_unary":
      case "field_access":
      case "number":
      case "id":
      case "boolean":
      case "null":
      case "string":
      case "simplified_string":
      case "address":
      case "cell":
      case "slice":
        warnings.push(warn());
        break;
      case "method_call":
        if (
          methodReturnTypes &&
          isSelf(expr.self) &&
          methodReturnTypes.get(idText(expr.method))
        ) {
          warnings.push(warn());
        }
        break;
      case "static_call": {
        const funName = idText(expr.function);
        if (
          !IGNORED_FUNCTIONS.has(funName) &&
          this.freeFunctionReturnTypes.get(funName)
        ) {
          warnings.push(warn());
        }
        break;
      }
      case "conditional":
        warnings.push(
          ...this.checkExpression(expr.thenBranch, methodReturnTypes),
        );
        warnings.push(
          ...this.checkExpression(expr.elseBranch, methodReturnTypes),
        );
        break;
      default:
        unreachable(expr);
    }
    return warnings;
  }
}
