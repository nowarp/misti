import { CompilationUnit } from "../../internals/ir";
import {
  foldStatements,
  collectMutations,
  mutationNames,
} from "../../internals/tactASTUtil";
import { intersection } from "../../internals/util";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstFunctionDef,
  AstContractInit,
  idText,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that highlights cases where function argument mutations are ineffective
 * due to call-by-value semantics in Tact.
 *
 * ## Why is it bad?
 * In Tact, function arguments are passed by value, meaning that any mutations applied
 * to these arguments will only affect the local copy of the variable within the function.
 * Such mutations are unobservable outside the function, except for potentially
 * increasing gas consumption or causing exceptions.
 *
 * ## Example
 * ```tact
 * fun addEntry(m: map<Int,Int>) {
 *   m.set(1, 10); // Bad: Mutating the copy
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * fun addEntry() {
 *   self.m.set(1, 10); // OK: Changing contract's state
 * }
 * ```
 *
 * Alternatively, you could redesign the method:
 * ```
 * fun generateNewValue(): Int {
 *   // ... produce new value for the map
 *   return self.nextValue + 1;
 * }
 *
 * m.set(self.nextKey, self.generateNewValue()); // OK
 * ```
 */
export class ArgCopyMutation extends ASTDetector {
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return Array.from(cu.ast.getFunctions()).reduce((acc, fun) => {
      if (fun.kind === "contract_init" || fun.kind === "function_def") {
        return acc.concat(
          foldStatements(fun, [] as MistiTactWarning[], (acc, stmt) => {
            return this.findArgCopyMutations(
              acc,
              stmt,
              this.collectInterestingArgs(fun),
            );
          }),
        );
      }
      return acc;
    }, [] as MistiTactWarning[]);
  }

  /**
   * Collects names of function argument that should be handled by this detector.
   */
  private collectInterestingArgs(
    fun: AstFunctionDef | AstContractInit,
  ): string[] {
    return fun.params.reduce((acc, p) => {
      // TODO: Should be improved when we have types in AST
      // Sort out integral types. It is unlikely that the user will expect they change inside the function.
      // See: tact:src/types/resolveExpression.ts
      const skipTypes = ["Int", "Bool"];
      if (p.type.kind === "type_id" && skipTypes.includes(p.type.text)) {
        return acc;
      }
      acc.push(idText(p.name));
      return acc;
    }, [] as string[]);
  }

  private findArgCopyMutations(
    acc: MistiTactWarning[],
    stmt: AstStatement,
    argNames: string[],
  ): MistiTactWarning[] {
    const mutations = collectMutations(stmt);
    const foundMutations = mutations
      ? intersection(argNames, mutationNames(mutations.mutatedLocals))
      : [];
    if (foundMutations.length > 0) {
      const mut = foundMutations.join(", ");
      acc.push(
        this.makeWarning(
          `Function argument${foundMutations.length === 1 ? ` ${mut} is` : `s ${mut} are`} mutated`,
          Severity.HIGH,
          stmt.loc,
          {
            extraDescription:
              "Mutating function arguments has no effect outside the function due to call-by-value semantics",
            suggestion:
              "Return the modified value or use the contract's state to avoid unnecessary mutations",
          },
        ),
      );
    }
    return acc;
  }
}
