import { CompilationUnit } from "../../internals/ir";
import {
  forEachExpression,
  hasInExpressions,
  foldStatements,
  collectFields,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstExpression,
  AstContractInit,
  AstReceiver,
  AstFieldDecl,
  AstStatement,
  AstOptionalType,
  AstFunctionDef,
  AstId,
  AstType,
  idText,
  AstContract,
} from "@tact-lang/compiler/dist/grammar/ast";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";

type UnusedVarInfo = { name: AstId; originalType: AstType };

/**
 * A detector variables and fields with unused optional modifier.
 *
 * ## Why is it bad?
 * `Optional` is a nullable value that has a special `null` value indicating the absence
 * of a value. If a developer creates an optional variable or field, he should leverage
 * its functionality by accessing the `null` value somewhere in his code. Otherwise,
 * the optional type should be removed to simplify and optimize the code.
 *
 * ## Example
 * ```tact
 * contract Test {
 *   a: Int?; // Bad: null value is never accessed
 *   init() { self.a = 42; }
 *   get fun getA(): Int { return self.a!!; }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Test {
 *   a: Int = 42; // OK: Removed optional
 *   get fun getA(): Int { return self.a; }
 * }
 * ```
 */
export class UnusedOptional extends ASTDetector {
  severity = Severity.LOW;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const freeFunctionWarnings = Array.from(cu.ast.getProgramEntries()).reduce(
      (acc, entry) => {
        if (entry.kind === "function_def") {
          return [...acc, ...this.checkFunction(entry as AstFunctionDef)];
        }
        return acc;
      },
      [] as MistiTactWarning[],
    );
    const contractWarnings = Array.from(cu.ast.getContracts()).reduce(
      (acc, contract) => [...acc, ...this.checkContract(contract)],
      [] as MistiTactWarning[],
    );
    return [...freeFunctionWarnings, ...contractWarnings];
  }

  /**
   * Checks for unused optional variables in local variables of a free function.
   * @param unusedOptionalFields Optional fields which use has not been found yet.
   */
  private checkFunction(
    fun: AstFunctionDef | AstReceiver | AstContractInit,
    unusedOptionalFields: Set<string> = new Set(),
  ): MistiTactWarning[] {
    return Array.from(
      foldStatements(
        fun,
        new Map<string, UnusedVarInfo>(),
        (unusedOptionalVars, stmt) => {
          if (
            stmt.kind === "statement_let" &&
            stmt.type !== null &&
            stmt.type.kind === "optional_type" &&
            // Filter out variables resulted of expressions that return optionals
            !this.returnsOptional(stmt.expression)
          ) {
            unusedOptionalVars.set(idText(stmt.name), {
              name: stmt.name,
              originalType: stmt.type.typeArg,
            });
          }
          this.removeUsedOptionals(
            stmt,
            unusedOptionalVars,
            unusedOptionalFields,
          );
          return unusedOptionalVars;
        },
      ).values(),
    ).map(({ name, originalType }) =>
      this.makeWarning(`Unused optional modifier: ${idText(name)}`, name.loc, {
        suggestion: `Remove optional modifier: \`let ${idText(name)}: ${prettyPrint(originalType)}\``,
      }),
    );
  }

  /**
   * Remove previously found variables which optional modifier is used.
   */
  private removeUsedOptionals(
    stmt: AstStatement,
    unusedOptionalVars: Map<string, UnusedVarInfo>,
    unusedOptionalFields: Set<string>,
  ): void {
    // Assignments to field access operations
    if (
      stmt.kind === "statement_assign" ||
      stmt.kind === "statement_augmentedassign"
    ) {
      const found = hasInExpressions(stmt.path, (expr) => {
        return expr.kind === "id" || expr.kind === "field_access";
      });
      if (found) {
        if (stmt.path.kind === "id") {
          unusedOptionalVars.delete(idText(stmt.path));
        } else if (
          stmt.path.kind === "field_access" &&
          stmt.path.aggregate.kind === "id" &&
          stmt.path.aggregate.text === "self"
        ) {
          unusedOptionalFields.delete(stmt.path.field.text);
        }
      }
    }

    forEachExpression(stmt, (expr) => {
      // null comparisons
      if (expr.kind === "op_binary") {
        [
          { id: expr.left, null: expr.right },
          { id: expr.right, null: expr.left },
        ].forEach(({ id, null: nullSide }) => {
          if (id.kind === "id" && nullSide.kind === "null") {
            unusedOptionalVars.delete(idText(id));
          } else if (
            id.kind === "field_access" &&
            id.aggregate.kind === "id" &&
            id.aggregate.text === "self" &&
            nullSide.kind === "null"
          ) {
            unusedOptionalFields.delete(id.field.text);
          }
        });
      }
      // Variables and fields involved in function calls
      if (expr.kind === "static_call" || expr.kind === "method_call") {
        expr.args.forEach((arg) => {
          if (arg.kind === "id") {
            unusedOptionalVars.delete(idText(arg));
          } else if (
            arg.kind === "field_access" &&
            arg.aggregate.kind === "id" &&
            arg.aggregate.text === "self"
          ) {
            unusedOptionalFields.delete(arg.field.text);
          }
        });
      }
    });
  }

  /**
   * Checks for unused optional variables in fields and method local variables of contracts.
   */
  private checkContract(contract: AstContract): MistiTactWarning[] {
    const fields = collectFields(contract);
    const optionalFields = new Map<string, AstFieldDecl>(
      Array.from(fields.entries()).filter(
        ([_, decl]) => decl.type.kind === "optional_type",
      ),
    );
    const optionalFieldNames = new Set<string>(optionalFields.keys());
    const localVariablesWarnings = contract.declarations.reduce((acc, decl) => {
      if (
        decl.kind === "function_def" ||
        decl.kind === "contract_init" ||
        decl.kind === "receiver"
      ) {
        return [...acc, ...this.checkFunction(decl, optionalFieldNames)];
      }
      return acc;
    }, [] as MistiTactWarning[]);
    const fieldWarnings = Array.from(optionalFields.keys()).reduce(
      (acc, fieldName) => {
        if (optionalFieldNames.has(fieldName)) {
          const decl = optionalFields.get(fieldName)!;
          const originalType = (decl.type as AstOptionalType).typeArg;
          acc.push(
            this.makeWarning(
              `Unused optional modifier: ${fieldName}`,
              decl.loc,
              {
                suggestion: `Remove optional modifier: \`${fieldName}: ${prettyPrint(originalType)}\``,
              },
            ),
          );
        }
        return acc;
      },
      [] as MistiTactWarning[],
    );
    return [...fieldWarnings, ...localVariablesWarnings];
  }

  /**
   * Indicates if the given expression has to return an optional, therefore if it is used as the rhs in an
   * assignment, the lhs should not be reported.
   */
  private returnsOptional(expr: AstExpression): boolean {
    // XXX: We consider all the values returning from functions as those that might be optional.
    //      We need types in the AST to be more precise here.
    const isCall = expr.kind === "static_call" || expr.kind === "method_call";
    // XXX: We cannot handle field access for the reason.
    const isFieldAccess = expr.kind === "field_access";
    return isCall || isFieldAccess;
  }
}
