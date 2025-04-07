import { CompilationUnit } from "../../internals/ir";
import { collectFields, forEachExpression, isSelf } from "../../internals/tact";
import { AstContract, AstFieldDecl } from "../../internals/tact/imports";
import { idText } from "../../internals/tact/imports";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

type FieldName = string;

const MAP_ADD_OPERATIONS = new Set<string>(["set"]);
const MAP_DEL_OPERATIONS = new Set<string>(["del"]);

/**
 * An optional detector that highlights cases where a map field allows inserting
 * values (e.g., via `.set`) but lacks functionality for removing entries (e.g., via `.del`).
 *
 * ## Why is it bad?
 * A map without a method to remove elements can lead to storage overflow, particularly
 * in long-term contract usage. Failing to provide a way to clear or delete entries
 * can result in uncontrolled storage growth, which not only wastes resources but
 * may also increase the cost of contract execution and maintenance over time.
 *
 * ## Example
 * ```tact
 * contract Test {
 *     map: Map<Int, String>;
 *
 *     setEntry(key: Int, value: String) {
 *         self.map.set(key, value); // Bad
 *     }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Test {
 *     map: Map<Int, String>;
 *
 *     setEntry(key: Int, value: String) {
 *         self.map.set(key, value);
 *     }
 *
 *     delEntry(key: Int) {
 *         self.map.del(key); // Fixed: Added a new API method
 *     }
 * }
 * ```
 */
export class UnboundMap extends AstDetector {
  severity = Severity.LOW;
  category = Category.SECURITY;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return Array.from(cu.ast.getContracts()).reduce(
      (acc, contract) => acc.concat(this.checkContract(contract)),
      [] as Warning[],
    );
  }

  private checkContract(contract: AstContract): Warning[] {
    const mapFields = Array.from(collectFields(contract).values()).reduce(
      (acc, field) => {
        if (field.type.kind === "map_type") acc.set(idText(field.name), field);
        return acc;
      },
      new Map<FieldName, AstFieldDecl>(),
    );
    const { added, removed } = this.findUses(contract, mapFields);
    return Array.from(added)
      .filter((name) => !removed.has(name))
      .map((notRemovedName) => {
        const decl = mapFields.get(notRemovedName)!;
        return this.makeWarning(
          `Map self.${notRemovedName} could be unbound`,
          decl.loc,
          {
            extraDescription:
              "There are operations adding elements to this map, but there is no API to remove them",
            suggestion:
              "Consider adding a method to remove elements or suppress this warning",
          },
        );
      });
  }

  /**
   * Finds which map fields has the operation adding elements to it (`added`)
   * and to remove them (`removed`).
   */
  private findUses(
    contract: AstContract,
    mapFields: Map<FieldName, AstFieldDecl>,
  ): { added: Set<FieldName>; removed: Set<FieldName> } {
    return contract.declarations.reduce(
      ({ added, removed }, decl) => {
        forEachExpression(decl, (expr) => {
          if (
            expr.kind === "method_call" &&
            expr.self.kind === "field_access" &&
            isSelf(expr.self.aggregate) &&
            mapFields.has(idText(expr.self.field))
          ) {
            if (MAP_ADD_OPERATIONS.has(idText(expr.method)))
              added.add(idText(expr.self.field));
            else if (MAP_DEL_OPERATIONS.has(idText(expr.method)))
              removed.add(idText(expr.self.field));
          }
        });
        return { added, removed };
      },
      { added: new Set<FieldName>(), removed: new Set<FieldName>() },
    );
  }
}
