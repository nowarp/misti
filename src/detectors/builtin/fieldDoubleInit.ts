import { CompilationUnit } from "../../internals/ir";
import { collectFields } from "../../internals/tact";
import { AstContract, AstContractInit } from "../../internals/tact/imports";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that highlights cases where a field is initialized both in the
 * `init` function and at the point of definition.
 *
 * ## Why is it bad?
 * Double initialization of fields can either be a programmer's mistake or simply
 * a waste of gas. It is always preferred to initialize values in the field declaration
 * if they have a compile-time evaluatable default value, or in the `init` function if
 * they must be initialized dynamically.
 *
 * ## Example
 * ```tact
 * contract Test {
 *     a: Int = 0; // Bad
 *     init(x: Int) { self.a = x }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Test {
 *     a: Int; // Fixed
 *     init(x: Int) { self.a = x }
 * }
 * ```
 */
export class FieldDoubleInit extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return Array.from(cu.ast.getContracts()).reduce(
      (acc, contract) => acc.concat(this.checkContract(contract)),
      [] as Warning[],
    );
  }

  /**
   * Looks for double-initialized fields in the given contract.
   */
  private checkContract(contract: AstContract): Warning[] {
    const init = contract.declarations.find(
      (decl) => decl.kind === "contract_init",
    ) as AstContractInit | undefined;
    if (init === undefined) {
      return [];
    }

    // Fields initialized in their declarations.
    const initializedInDecl = new Set(
      collectFields(contract, {
        initialized: true,
      }).keys(),
    );
    if (initializedInDecl.size === 0) {
      return [];
    }

    // Check if they are used in `init`.
    return init.statements.reduce((acc, stmt) => {
      if (
        stmt.kind === "statement_assign" &&
        stmt.path.kind === "field_access" &&
        stmt.path.aggregate.kind === "id" &&
        stmt.path.aggregate.text === "self" &&
        initializedInDecl.has(stmt.path.field.text)
      ) {
        acc.push(
          this.makeWarning(
            `Field ${stmt.path.field.text} is initialized twice`,
            stmt.loc,
            {
              suggestion:
                "Consider initializing the field only in its declaration or in the `init` function",
            },
          ),
        );
      }
      return acc;
    }, [] as Warning[]);
  }
}
