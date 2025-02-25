import { CompilationUnit } from "../../internals/ir";
import { Effect } from "../../internals/ir/callGraph";
import {
  forEachExpression,
  foldStatements,
  collectMutations,
} from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import {
  AstFunctionDef,
  AstStaticCall,
  AstMethodCall,
  AstExpression,
  idText,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * An optional detector that identifies cases where a state-mutating function is called within a getter method.
 *
 * ## Why is it bad?
 * Getter methods are expected to be pure functions that don't modify state. When a getter
 * modifies state (directly or by calling other functions that do), it violates this principle
 * and can lead to unexpected behavior, race conditions, and increased gas costs. Functions
 * that modify state should be explicitly marked as such, not disguised as getters.
 *
 * ## Example
 * ```tact
 * contract Example {
 *   value: Int = 0;
 *
 *   get fun getValue(): Int {
 *     self.updateCounter(); // Bad: Calls a function that modifies state
 *     return self.value;
 *   }
 *
 *   fun updateCounter() {
 *     self.value = self.value + 1; // Modifies state
 *   }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Example {
 *   value: Int = 0;
 *
 *   get fun getValue(): Int {
 *     return self.value; // OK: Pure getter
 *   }
 *
 *   fun getAndIncrement(): Int {
 *     let current = self.value;
 *     self.value = self.value + 1;
 *     return current;
 *   }
 * }
 * ```
 */
export class StateMutationInGetter extends AstDetector {
  severity = Severity.LOW;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];

    for (const contract of cu.ast.getContracts()) {
      for (const decl of contract.declarations) {
        if (
          decl.kind === "function_def" &&
          decl.attributes.some((attr) => attr.type === "get")
        ) {
          this.checkGetterForStateMutations(
            cu,
            decl,
            contract.name.text,
            warnings,
          );
        }
      }
    }

    return warnings;
  }

  /**
   * Checks if a getter function contains state-mutating function calls or direct mutations
   */
  private checkGetterForStateMutations(
    cu: CompilationUnit,
    getter: AstFunctionDef,
    contractName: string,
    warnings: MistiTactWarning[],
  ): void {
    // Direct state mutations
    this.checkDirectStateMutations(getter, warnings);

    // Indirect state mutations through function calls
    forEachExpression(getter, (expr: AstExpression) => {
      if (expr.kind === "static_call") {
        this.checkStaticCall(cu, expr, contractName, warnings);
      } else if (expr.kind === "method_call") {
        this.checkMethodCall(cu, expr, contractName, warnings);
      }
    });
  }

  /**
   * Direct state mutations in statements
   */
  private checkDirectStateMutations(
    getter: AstFunctionDef,
    warnings: MistiTactWarning[],
  ): void {
    foldStatements(
      getter,
      (acc, stmt) => {
        const mutations = collectMutations(stmt);
        if (mutations && mutations.mutatedFields.length > 0) {
          acc.push(
            this.makeWarning(
              "Getter directly mutates contract state",
              stmt.loc,
              {
                extraDescription:
                  "Getter methods should not modify state directly or indirectly",
                suggestion:
                  "Move state-modifying logic to a non-getter function",
              },
            ),
          );
        }
        return acc;
      },
      warnings,
    );
  }

  /**
   * Checks if a static function call might modify state
   */
  private checkStaticCall(
    cu: CompilationUnit,
    call: AstStaticCall,
    contractName: string,
    warnings: MistiTactWarning[],
  ): void {
    const calleeName = idText(call.function);
    const calleeNodeId = cu.callGraph.getNodeIdByName(calleeName);

    if (calleeNodeId !== undefined) {
      const calleeNode = cu.callGraph.getNode(calleeNodeId);
      if (calleeNode && calleeNode.hasEffect(Effect.StateWrite)) {
        warnings.push(
          this.makeWarning(
            `Getter calls state-mutating function: ${calleeName}`,
            call.loc,
            {
              extraDescription:
                "Getter methods should not modify state directly or indirectly",
              suggestion: "Move state-modifying logic to a non-getter function",
            },
          ),
        );
      }
    }
  }

  /**
   * Checks if a method call might modify state
   */
  private checkMethodCall(
    cu: CompilationUnit,
    call: AstMethodCall,
    contractName: string,
    warnings: MistiTactWarning[],
  ): void {
    // For self.method() calls check the contract's method
    if (call.self.kind === "id" && idText(call.self) === "self") {
      const methodName = idText(call.method);
      const fullMethodName = `${contractName}::${methodName}`;
      const calleeNodeId = cu.callGraph.getNodeIdByName(fullMethodName);
      if (calleeNodeId !== undefined) {
        const calleeNode = cu.callGraph.getNode(calleeNodeId);
        if (calleeNode && calleeNode.hasEffect(Effect.StateWrite)) {
          warnings.push(
            this.makeWarning(
              `Getter calls state-mutating method: ${methodName}`,
              call.loc,
              {
                extraDescription:
                  "Getter methods should not modify state directly or indirectly",
                suggestion:
                  "Move state-modifying logic to a non-getter function",
              },
            ),
          );
        }
      }
    }
  }
}
