import { InternalException } from "../../internals/exceptions";
import { CompilationUnit, FunctionName } from "../../internals/ir";
import {
  foldStatements,
  collectMutations,
  mutationNames,
  funName,
  hasInExpressions,
} from "../../internals/tact";
import {
  AstStatement,
  AstFunctionDef,
  AstContractInit,
  idText,
} from "../../internals/tact/imports";
import { intersectLists } from "../../internals/util";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that highlights cases where function argument mutations are ineffective
 * due to [call-by-value semantics](https://en.wikipedia.org/wiki/Evaluation_strategy#Call_by_value) in Tact.
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
 * ```tact
 * fun generateNewValue(): Int {
 *   // ... produce new value for the map
 *   return self.nextValue + 1;
 * }
 *
 * m.set(self.nextKey, self.generateNewValue()); // OK
 * ```
 */
export class ArgCopyMutation extends AstDetector {
  severity = Severity.HIGH;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const returnStatements = this.collectReturnStatements(cu);
    return Array.from(cu.ast.getFunctions()).reduce((acc, fun) => {
      if (fun.kind === "contract_init" || fun.kind === "function_def") {
        this.collectMutations(fun).forEach((argMutationStatements, argName) => {
          // If all the return statements use the modified argument, it won't be reported
          if (fun.kind === "function_def") {
            const funReturns = returnStatements.get(
              idText(fun.name) as FunctionName,
            )!;
            if (funReturns === undefined) {
              this.ctx.logger.error(
                `Cannot find return statements: ${idText(fun.name)}`,
              );
              return;
            }
            if (this.usedInAllReturns(argName, funReturns)) {
              return; // OK
            }
          }
          const occurrencesStr =
            argMutationStatements.length > 1
              ? ` (${argMutationStatements.length - 1} more times)`
              : "";
          acc.push(
            this.makeWarning(
              `Function ${funName(fun)} argument ${argName} is mutated${occurrencesStr}`,
              argMutationStatements[0].loc,
              {
                extraDescription:
                  "Mutating function arguments has no effect outside the function due to call-by-value semantics",
                suggestion:
                  "Return the modified value or use the contract's state to avoid unnecessary mutations",
              },
            ),
          );
        });
      }
      return acc;
    }, [] as MistiTactWarning[]);
  }

  /**
   * Checks if the argument is used in all return statements.
   * @param argName The name of the argument to check.
   * @param returnStatements The return statements to check.
   * @returns `true` if the argument is used in all return statements, `false` otherwise.
   */
  private usedInAllReturns(
    argName: string,
    returnStatements: AstStatement[],
  ): boolean {
    if (returnStatements.length === 0) {
      return false;
    }
    return returnStatements.every((stmt) => {
      if (stmt.kind !== "statement_return" || !stmt.expression) {
        return false;
      }
      return hasInExpressions(
        stmt.expression,
        (expr) => expr.kind === "id" && expr.text === argName,
      );
    });
  }

  /**
   * Collects all return statements from the given compilation unit.
   * @param cu The compilation unit to analyze.
   * @returns A map of function names to their return statements.
   */
  private collectReturnStatements(
    cu: CompilationUnit,
  ): Map<FunctionName, AstStatement[]> {
    return cu.foldCFGs(
      new Map<FunctionName, AstStatement[]>(),
      (acc, cfg) => {
        acc.set(
          cfg.name,
          cfg.getExitNodes().reduce((acc, bb) => {
            const stmt = cu.ast.getStatement(bb.stmtID);
            if (!stmt) {
              throw InternalException.make(
                `Cannot find a statement for BB #${bb.idx}`,
              );
            }
            // Filter out throw statements
            if (stmt.kind === "statement_return") {
              acc.push(stmt);
            }
            return acc;
          }, [] as AstStatement[]),
        );
        return acc;
      },
      { includeStdlib: false },
    );
  }

  /**
   * Collects mutations of function arguments within a given statement.
   * @param fun The function to analyze.
   * @returns A map of argument names to the statements where they are mutated.
   */
  private collectMutations(
    fun: AstFunctionDef | AstContractInit,
  ): Map<string, AstStatement[]> {
    return foldStatements(
      fun,
      (acc, stmt) => {
        const interestingArgs = this.collectInterestingArgs(fun);
        if (interestingArgs.length === 0) {
          return acc;
        }
        const stmtMutations = this.findArgCopyMutations(stmt, interestingArgs);
        return Array.from(stmtMutations.entries()).reduce(
          (newAcc, [argName, mutationStmts]) => {
            const existingStmts = newAcc.get(argName) || [];
            return newAcc.set(argName, [...existingStmts, ...mutationStmts]);
          },
          new Map(acc),
        );
      },
      new Map<string, AstStatement[]>(),
    );
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

  /**
   * Identifies mutations of function arguments within a given statement.
   * @param argNames Names of function arguments to check for mutations.
   * @returns A map of argument names to the statements where they are mutated.
   */
  private findArgCopyMutations(
    stmt: AstStatement,
    argNames: string[],
  ): Map<string, AstStatement[]> {
    const mutations = collectMutations(stmt, { flatStmts: true });
    const foundMutations = mutations
      ? intersectLists(argNames, mutationNames(mutations.mutatedLocals))
      : [];
    return foundMutations.reduce((mutationMap, argName) => {
      const existingStatements = mutationMap.get(argName) || [];
      return mutationMap.set(argName, [...existingStatements, stmt]);
    }, new Map<string, AstStatement[]>());
  }
}
