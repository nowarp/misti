import { CompilationUnit } from "../../internals/ir";
import { AstFunctionDef } from "../../internals/tact/imports";
import { findInExpressions } from "../../internals/tact/iterators";
import {
  isSelfAccess,
  isSelf,
  isSelfMethod,
  functionHasAttribute,
} from "../../internals/tact/util";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * Detects contract methods that do not access internal state and suggests replacing them with global functions.
 *
 * ## Why is it bad?
 * - **Gas inefficiency**: Contract method calls (`self.func()`) cost more gas than global function calls (`func()`) due to unnecessary `self` context resolution.
 * - **Cleaner code**: Global functions better represent stateless logic, making intent clearer.
 *
 * See: https://docs.tact-lang.org/book/gas-best-practices/#avoid-internal-contract-functions
 *
 * ## Example
 * ```tact
 * contract Math {
 *   // Bad: `add()` doesn't use `self`
 *   fun add(a: Int, b: Int): Int {
 *     return a + b;
 *   }
 *   // other methods
 * }
 *
 * ```
 *
 * Use instead:
 * ```tact
 * // Good: Replace with a global function
 * fun add(a: Int, b: Int): Int {
 *   return a + b;
 * }
 * contract Math {
 *   // other methods
 * }
 * ```
 */
export class PreferGlobalFunction extends AstDetector {
  severity = Severity.LOW;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    const warnings: Warning[] = [];
    for (const [_, contract] of cu.getContracts()) {
      for (const [_, methodCfg] of contract.methods) {
        const methodAst = cu.ast.getFunction(methodCfg.id);
        if (!methodAst) {
          this.ctx.logger.warn(
            `Cannot find AST node for method #${methodCfg.name} (${methodCfg.id})`,
          );
          continue;
        }
        if (
          methodAst.kind === "contract_init" ||
          methodAst.kind === "receiver" ||
          functionHasAttribute(methodAst, "override")
        ) {
          continue;
        }
        if (!this.methodUsesSelf(methodAst)) {
          warnings.push(
            this.makeWarning(
              `Method '${methodCfg.name}' doesn't access contract state and should be a global function`,
              methodCfg.ref,
              {
                suggestion: `Consider converting '${methodCfg.name}' to a global function for better gas efficiency and cleaner code.`,
              },
            ),
          );
        }
      }
    }
    return warnings;
  }

  /**
   * Checks if a method body references 'self' in any way
   */
  private methodUsesSelf(method: AstFunctionDef): boolean {
    return (
      findInExpressions(
        method,
        (expr) => isSelf(expr) || isSelfAccess(expr) || isSelfMethod(expr),
      ) !== null
    );
  }
}
