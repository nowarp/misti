import { InternalException } from "../../internals/exceptions";
import { CompilationUnit } from "../../internals/ir";
import { foldStatements } from "../../internals/tactASTUtil";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import { AstStatement, isSelfId } from "@tact-lang/compiler/dist/grammar/ast";

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
export class InheritedStateMutation extends ASTDetector {
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return Array.from(cu.ast.getContracts()).reduce((acc, contract) => {
      const inheritedFields = cu.ast.getInheritedFields(contract.id);
      if (inheritedFields === undefined) {
        throw InternalException.make(
          `Cannot fetch trait fields for contract ${contract.name}`,
        );
      }
      const inheritedFieldNames = inheritedFields.map((f) => f.name.text);
      return acc.concat(
        foldStatements(contract, [] as MistiTactWarning[], (acc, stmt) => {
          return this.findInheritedFieldAssignments(
            acc,
            stmt,
            inheritedFieldNames,
          );
        }),
      );
    }, [] as MistiTactWarning[]);
  }

  private findInheritedFieldAssignments(
    acc: MistiTactWarning[],
    stmt: AstStatement,
    inheritedFieldNames: string[],
  ): MistiTactWarning[] {
    if (
      (stmt.kind === "statement_assign" ||
        stmt.kind === "statement_augmentedassign") &&
      stmt.path.kind === "field_access" &&
      stmt.path.aggregate.kind === "id" &&
      isSelfId(stmt.path.aggregate) &&
      inheritedFieldNames.includes(stmt.path.field.text)
    ) {
      acc.push(
        this.makeWarning(
          "Inherited Trait Variable Mutation",
          Severity.LOW,
          stmt.loc,
          {
            extraDescription:
              "Directly modifying inherited trait variables can indicate a potential error or poor design",
            suggestion: "Consider using setter methods to preserve invariants",
          },
        ),
      );
    }
    return acc;
  }
}
