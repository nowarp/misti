import { forEachExpression } from "./iterators";
import { AstComparator } from "@tact-lang/compiler/dist/";
import {
  AstExpression,
  AstId,
  AstFieldAccess,
  AstStatement,
  AstMethodCall,
  SrcInfo,
  isSelfId,
  idText,
  tryExtractPath,
} from "@tact-lang/compiler/dist/grammar/ast";
import { Interval as RawInterval } from "ohm-js";
import * as path from "path";

/**
 * Creates a concise string representation of `SrcInfo`.
 */
export function formatPosition(ref?: SrcInfo): string {
  if (!ref || !ref.file) {
    return "";
  }
  const relativeFilePath = path.relative(process.cwd(), ref.file);
  const lc = ref.interval.getLineAndColumn();
  return `${relativeFilePath}: ${lc}\n`;
}

/**
 * Returns the accessor name without the leading `self.` part.
 *
 * For example:
 * - `self.a` -> AstId(`a`)
 * - `self.a()` -> AstMethodCall(`a`)
 * - `self.object.f1` -> AstFieldAccess(`object.f1`)
 * - `nonSelf.a` -> undefined
 */
export function removeSelf(
  expr: AstExpression,
): AstId | AstFieldAccess | undefined {
  if (expr.kind === "method_call") {
    return removeSelf(expr.self);
  }
  if (expr.kind === "field_access") {
    if (isSelf(expr.aggregate)) {
      return expr.field;
    } else {
      const newAggregate = removeSelf(expr.aggregate);
      if (newAggregate !== undefined) {
        return {
          ...expr,
          aggregate: newAggregate,
        };
      }
    }
  }
  return undefined;
}

/**
 * @returns True for self identifiers: `self`.
 */
export function isSelf(expr: AstExpression): boolean {
  return expr.kind === "id" && isSelfId(expr);
}

/**
 * @returns True for self access expressions: `self.a`, `self.a.b`.
 */
export function isSelfAccess(expr: AstExpression): boolean {
  const path = tryExtractPath(expr);
  return path !== null && path.length > 1 && isSelfId(path[0]);
}

/**
 * @returns True iff `call` is a stdlib method mutating its receiver.
 */
export function isStdlibMutationMethod(call: AstMethodCall): boolean {
  // https://docs.tact-lang.org/book/maps
  const mapMutationOperations = ["set", "del"];
  // See: stdlib/std/cells.tact
  const builderMutationOperations = [
    "storeInt",
    "storeUint",
    "storeBool",
    "storeBit",
    "storeCoins",
    "storeRef",
    "storeSlice",
    "storeBuilder",
    "storeAddress",
    "storeMaybeRef",
  ];
  const methodName = idText(call.method);
  return (
    // Filter out contract calls e.g.: `self.set(/*...*/)`
    !isSelf(call.self) &&
    // TODO: This should be rewritten when we have types in AST
    (mapMutationOperations.includes(methodName) ||
      builderMutationOperations.includes(methodName))
  );
}

export type MutatedElement = AstId | AstFieldAccess;

/**
 * Collects mutations local or state mutations within the statements.
 *
 * @param The statement to analyze
 * @returns Mutated fields and local identifiers, including nested fields of mutated structure instances
 */
export function collectMutations(
  stmt: AstStatement,
):
  | { mutatedFields: MutatedElement[]; mutatedLocals: MutatedElement[] }
  | undefined {
  const mutatedFields: MutatedElement[] = [];
  const mutatedLocals: MutatedElement[] = [];

  const handleMethodCallsMutations = (): void => {
    forEachExpression(stmt, (expr: AstExpression) => {
      if (expr.kind === "method_call" && isStdlibMutationMethod(expr)) {
        if (isSelfAccess(expr.self)) {
          // Field mutation
          const mutated = removeSelf(expr);
          if (mutated) {
            mutatedFields.push(mutated);
          }
        } else {
          // Local mutation
          if (expr.self.kind === "field_access" || expr.self.kind === "id")
            mutatedLocals.push(expr.self);
        }
      }
    });
  };
  handleMethodCallsMutations();

  const handleAssignmentMutations = (): void => {
    if (
      stmt.kind === "statement_assign" ||
      stmt.kind === "statement_augmentedassign"
    ) {
      const field = removeSelf(stmt.path);
      if (field) {
        // Field mutations
        mutatedFields.push(field);
      } else {
        // Local mutations
        const local = stmt.path;
        if (local.kind === "field_access" || local.kind === "id") {
          mutatedLocals.push(local);
        }
      }
    }
  };
  handleAssignmentMutations();

  return !mutatedFields.length && !mutatedLocals.length
    ? undefined
    : { mutatedFields, mutatedLocals };
}

/**
 * Collects names of the mutated elements.
 *
 * For example:
 * - a -> a
 * - self.a -> a
 * - self.object.f1 -> object
 */
export function mutationNames(items: MutatedElement[]): string[] {
  return items.flatMap((item) => {
    if (item.kind === "id") {
      return [item.text];
    } else if (item.kind === "field_access") {
      const path = tryExtractPath(item);
      return path && path.length >= 2 ? [path[0].text] : [];
    } else {
      return [];
    }
  });
}

/**
 * Set containing information about the locations with some additional information.
 * We need this, since `SrcInfo` objects cannot be trivially compared.
 */
export class SrcInfoSet<T> {
  private items: [T, SrcInfo][];

  constructor(pairs?: [T, SrcInfo][]) {
    this.items = [];
    if (pairs) {
      pairs.forEach((pair) => this.add(pair));
    }
  }

  add(item: [T, SrcInfo]) {
    if (!this.has(item)) {
      this.items.push(item);
    }
  }

  has(item: [T, SrcInfo]): boolean {
    return this.items.some((existingItem) =>
      this.equals(existingItem[1], item[1]),
    );
  }

  delete(item: [T, SrcInfo]): boolean {
    const index = this.items.findIndex((existingItem) =>
      this.equals(existingItem[1], item[1]),
    );
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  extract(): [T, SrcInfo][] {
    return this.items.slice();
  }

  private equals(srcInfo1: SrcInfo, srcInfo2: SrcInfo): boolean {
    return (
      srcInfo1.file === srcInfo2.file &&
      srcInfo1.contents === srcInfo2.contents &&
      this.compareIntervals(srcInfo1.interval, srcInfo2.interval) &&
      srcInfo1.origin === srcInfo2.origin
    );
  }

  private compareIntervals(
    interval1: RawInterval,
    interval2: RawInterval,
  ): boolean {
    return (
      interval1.sourceString === interval2.sourceString &&
      interval1.startIdx === interval2.startIdx &&
      interval1.endIdx === interval2.endIdx &&
      interval1.contents === interval2.contents
    );
  }
}

/**
 * Returns true iff the input expression represents a primitive literal.
 */
export function isPrimitiveLiteral(expr: AstExpression): boolean {
  return ["null", "boolean", "number", "string"].includes(expr.kind);
}

/**
 * Checks if the AST of two nodes is equal using the Tact AST comparison API.
 */
export function nodesAreEqual(
  node1: AstExpression | AstStatement,
  node2: AstExpression | AstStatement,
): boolean {
  return AstComparator.make({ sort: true, canonicalize: false }).compare(
    node1,
    node2,
  );
}

/**
 * Checks if the AST of two lists of statements is equal using the Tact AST comparison API.
 */
export function statementsAreEqual(
  stmts1: AstStatement[],
  stmts2: AstStatement[],
): boolean {
  if (stmts1.length !== stmts2.length) return false;
  return stmts1.every((stmt, i) => {
    return nodesAreEqual(stmt, stmts2[i]);
  });
}
