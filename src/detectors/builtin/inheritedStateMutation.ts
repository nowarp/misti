import { InternalException } from "../../internals/exceptions";
import { CompilationUnit } from "../../internals/ir";
import {
  foldStatements,
  collectMutations,
  mutationNames,
} from "../../internals/tact";
import { AstStatement, AstNode } from "../../internals/tact/imports";
import { intersectLists } from "../../internals/util";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * An optional detector that highlights all instances where inherited trait variables
 * are directly modified.
 *
 * ## Why is it bad?
 * Traits should provide setter methods to ensure that invariants related to their
 * state are preserved. Directly modifying trait variables (e.g., `self.traitVar = 42`)
 * can violate these invariants, leading to potential bugs or security vulnerabilities.
 * This detector warns when such direct modifications occur, prompting further review
 * by auditors.
 *
 * ## Example
 * ```tact
 * trait T {
 *   balance: Int;
 * }
 *
 * contract C with T {
 *   balance: Int = 42;
 *   fun updateBalance() {
 *     self.balance = 100; // Suspicious: Highlighted by the detector
 *   }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * trait T {
 *   balance: Int;
 *   fun setBalance(newBalance: Int) {
 *     require(newBalance > 0, "balance cannot be negative"); // Invariant check
 *     self.balance = newBalance;
 *   }
 * }
 *
 * contract C with T {
 *   balance: Int = 42;
 *   fun updateBalance() {
 *     self.setBalance(100); // OK: Invariant preserved
 *   }
 * }
 * ```
 */
export class InheritedStateMutation extends AstDetector {
  severity = Severity.LOW;
  category = Category.BEST_PRACTICES;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return Array.from(cu.ast.getContracts()).reduce((acc, contract) => {
      const contractAst = cu.ast.getContract(contract.id);
      if (!contractAst)
        throw InternalException.make(
          `Cannot find contract AST: ${contract.name}`,
        );
      const inheritedFields = cu.ast.getInheritedFields(contract.id);
      if (inheritedFields === undefined) {
        throw InternalException.make(
          `Cannot fetch trait fields for contract ${contract.name}`,
        );
      }
      const inheritedFieldNames = inheritedFields.map((f) => f.name.text);
      const check = (node: AstNode): Warning[] =>
        foldStatements(
          node,
          (acc, stmt) => {
            return this.findInheritedFieldAssignments(
              acc,
              stmt,
              inheritedFieldNames,
            );
          },
          [] as Warning[],
        );
      const contractWarnings = contract.declarations.reduce((acc, decl) => {
        // Skip init functions since we cannot access self to use setters
        return decl.kind === "function_def" || decl.kind === "receiver"
          ? acc.concat(check(decl))
          : acc;
      }, [] as Warning[]);
      return acc.concat(contractWarnings);
    }, [] as Warning[]);
  }

  private findInheritedFieldAssignments(
    acc: Warning[],
    stmt: AstStatement,
    inheritedFieldNames: string[],
  ): Warning[] {
    const mutations = collectMutations(stmt);
    const foundMutations = mutations
      ? intersectLists(
          inheritedFieldNames,
          mutationNames(mutations.mutatedFields),
        )
      : [];
    if (foundMutations.length > 0) {
      const mut = foundMutations.join(", ");
      acc.push(
        this.makeWarning(
          `Inherited trait field${foundMutations.length === 1 ? ` ${mut} is` : `s ${mut} are`} mutated`,
          stmt.loc,
          {
            extraDescription:
              "Directly modifying inherited trait fields can indicate a potential error or poor design",
            suggestion: "Consider using setter methods to preserve invariants",
          },
        ),
      );
    }
    return acc;
  }
}
