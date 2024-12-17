import { forEachExpression } from "./iterators";
import { evalToType } from "../../internals/tact/";
import { unreachable } from "../util";
import { AstComparator } from "@tact-lang/compiler/dist/";
import {
  AstExpression,
  AstId,
  AstContractInit,
  AstFieldDecl,
  AstFunctionDef,
  AstReceiver,
  AstContract,
  AstFieldAccess,
  AstStatement,
  AstMethodCall,
  SrcInfo,
  isSelfId,
  idText,
  tryExtractPath,
  AstCondition,
} from "@tact-lang/compiler/dist/grammar/ast";
import { prettyPrint } from "@tact-lang/compiler/dist/prettyPrinter";
import { Interval as RawInterval } from "ohm-js";
import * as path from "path";

/** Stdlib functions that access datetime functions. */
export const DATETIME_NAMES = new Set(["now", "timestamp"]);

/** Stdlib functions that initialize PRG seed. */
export const PRG_INIT_NAMES = new Set([
  "nativePrepareRandom",
  "nativeRandomize",
  "nativeRandomizeLt",
]);

/** Native stdlib functions that use PRG. */
export const PRG_NATIVE_USE_NAMES = new Set([
  "nativeRandom",
  "nativeRandomInterval",
]);

/** Safe Tact wrapper functions that use PRG. */
export const PRG_SAFE_USE_NAMES = new Set(["random", "randomInt"]);

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
 * @param flatStmts If true, only traverse statements at the current level without
 *                  going into nested statements. It should be used when calling this function
 *                  inside one of the iterators.
 * @returns Mutated fields and local identifiers, including nested fields of mutated structure instances
 */
export function collectMutations(
  stmt: AstStatement,
  { flatStmts = false }: Partial<{ flatStmts: boolean }> = {},
):
  | { mutatedFields: MutatedElement[]; mutatedLocals: MutatedElement[] }
  | undefined {
  const mutatedFields: MutatedElement[] = [];
  const mutatedLocals: MutatedElement[] = [];

  const handleMethodCallsMutations = (): void => {
    forEachExpression(
      stmt,
      (expr: AstExpression) => {
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
      },
      { flatStmts },
    );
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

/**
 * Collects declarations of all the contract fields.
 */
export function collectFields(
  contract: AstContract,
  { initialized = false }: Partial<{ initialized: boolean }> = {},
): Map<string, AstFieldDecl> {
  return contract.declarations.reduce((acc, decl) => {
    if (
      decl.kind === "field_decl" &&
      (!initialized || decl.initializer !== null)
    ) {
      acc.set(decl.name.text, decl);
    }
    return acc;
  }, new Map<string, AstFieldDecl>());
}

/**
 * Returns the human-readable name of the function.
 */
export function funName(
  fun: AstReceiver | AstContractInit | AstFunctionDef,
): string {
  switch (fun.kind) {
    case "contract_init":
      return "init";
    case "receiver":
      return prettyPrint(fun).split("\n")[0].slice(0, -3);
    case "function_def":
      return idText(fun.name);
    default:
      unreachable(fun);
  }
}

/**
 * Collects all the conditions from the conditional, including `if` and `else if` statements.
 */
export function collectConditions(
  node: AstCondition,
  { nonEmpty = false }: Partial<{ nonEmpty: boolean }> = {},
): AstExpression[] {
  const conditions: AstExpression[] = nonEmpty
    ? node.trueStatements.length > 0
      ? [node.condition]
      : []
    : [node.condition];
  if (node.elseif) {
    conditions.push(...collectConditions(node.elseif));
  }
  return conditions;
}

/**
 * Converts SrcInfo to the string representation shown to the user.
 */
export function srcInfoToString(loc: SrcInfo): string {
  const lc = loc.interval.getLineAndColumn() as {
    lineNum: number;
    colNum: number;
  };
  const lcStr = `${lc}`;
  const lcLines = lcStr.split("\n");
  lcLines.shift();
  const shownPath = loc.file
    ? path.relative(process.cwd(), loc.file) + ":"
    : "";
  return `${shownPath}${lc.lineNum}:${lc.colNum}:\n${lcLines.join("\n")}`;
}

/**
 * Collects a chain of method calls.
 *
 * The return format is the following: `expr.method1().method2()`, where `expr`
 * might be a function call, e.g.:
 *
 * beginCell().loadRef(c).endCell();
 * ^^^^^^^^^^^ ^^^^^^^^^^ ^^^^^^^^^^
 *    self      calls[0]   calls[1]
 *
 * @returns An array of expressions representing the method call chain and the
 *          first receiver that might be an expression creating a callable
 *          object, or undefined if it's not a method call chain.
 */
export function getMethodCallsChain(
  expr: AstExpression,
): { self: AstExpression; calls: AstMethodCall[] } | undefined {
  const calls: AstMethodCall[] = [];
  let currentExpr: AstExpression = expr;
  while (currentExpr.kind === "method_call") {
    const methodCall = currentExpr as AstMethodCall;
    calls.push(methodCall);
    currentExpr = methodCall.self;
  }
  if (calls.length === 0) {
    return undefined;
  }
  return { self: currentExpr, calls: calls.reverse() };
}

/**
 * Returns true if the given expression represents a call of the function `name`
 * with `argsNum` arguments.
 */
export function isFunctionCall(
  expr: AstExpression,
  name: string,
  argsNum: number,
): boolean {
  return (
    expr.kind === "static_call" &&
    idText(expr.function) === name &&
    expr.args.length === argsNum
  );
}

/**
 * Returns true if the given expression represents a call of the method `name`
 * with `argsNum` arguments.
 */
export function isMethodCall(
  expr: AstExpression,
  name: string,
  argsNum: number,
): boolean {
  return (
    expr.kind === "method_call" &&
    idText(expr.method) === name &&
    expr.args.length === argsNum
  );
}

/**
 * Returns true if the given expression is a call of the supported stdlib
 * function or method.
 */
export function isStdlibCall(name: string, expr: AstExpression): boolean {
  const stdlibFunctions: Record<string, number> = {
    beginCell: 0,
    endCell: 0,
    emptyCell: 0,
    emptySlice: 0,
  };
  const stdlibMethods: Record<string, number> = {
    storeMaybeRef: 1,
    storeRef: 1,
    loadRef: 0,
  };

  const expectedFunctionArgs = stdlibFunctions[name];
  if (expectedFunctionArgs !== undefined) {
    return isFunctionCall(expr, name, expectedFunctionArgs);
  }

  const expectedMethodArgs = stdlibMethods[name];
  if (expectedMethodArgs !== undefined) {
    return isMethodCall(expr, name, expectedMethodArgs);
  }

  return false;
}

/**
 * Size of the Address variable stored in Cell.
 */
export const ADDRESS_SIZE = 267n;

/**
 * Returns the size of the storage added by the given `.store` method call.
 */
export function getConstantStoreSize(call: AstMethodCall): bigint | undefined {
  switch (idText(call.method)) {
    case "storeBool":
    case "storeBit":
      return 1n;
    case "storeCoins": {
      if (call.args.length !== 1) return undefined;
      // The serialization size varies from 4 to 124 bits:
      // https://docs.tact-lang.org/book/integers/#serialization-coins
      const value = evalToType(call.args[0], "bigint");
      if (value !== undefined) {
        const numValue = Number(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
          // We use the following logic from ton-core in order to compute the size:
          // https://github.com/ton-org/ton-core/blob/00fa47e03c2a78c6dd9d09e517839685960bc2fd/src/boc/BitBuilder.ts#L212
          const sizeBytes = Math.ceil(numValue.toString(2).length / 8);
          const sizeBits = sizeBytes * 8;
          // 44-bit unsigned big-endian integer storing the byte length of the
          // value provided
          const sizeLength = 4;
          return BigInt(sizeBits + sizeLength);
        }
      }
      // TODO: Return an interval of possible values
      return undefined;
    }
    case "storeAddress":
      return ADDRESS_SIZE;
    case "storeInt":
    case "storeUint": {
      if (call.args.length !== 2) return undefined;
      const value = evalToType(call.args[1], "bigint");
      return value === undefined ? undefined : (value as bigint);
    }
    case "storeBuilder":
    case "storeSlice":
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Returns the size of the storage substrated by the given `.load` method call.
 */
export function getConstantLoadSize(call: AstMethodCall): bigint | undefined {
  switch (idText(call.method)) {
    case "loadBool":
    case "loadBit":
      return 1n;
    case "loadCoins": {
      // The size is dynamically loaded from the cell, thus we cannot retrieve it statically:
      // https://github.com/ton-org/ton-core/blob/00fa47e03c2a78c6dd9d09e517839685960bc2fd/src/boc/BitReader.ts#L290
      // TODO: Return an interval of possible values
      return undefined;
    }
    case "loadAddress":
      return ADDRESS_SIZE;
    case "loadInt":
    case "loadUint": {
      if (call.args.length !== 1) return undefined;
      const value = evalToType(call.args[0], "bigint");
      // TODO: Return an interval of possible values
      return value === undefined ? undefined : (value as bigint);
    }
    case "loadBuilder":
    case "loadSlice":
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Determines if the given expression is a 'send' call.
 * @param expr The expression to check.
 * @returns True if the expression is a 'send' call; otherwise, false.
 */
export function isSendCall(expr: AstExpression): boolean {
  const staticSendFunctions = ["send", "nativeSendMessage"];
  const selfMethodSendFunctions = ["reply", "forward", "notify", "emit"];
  return (
    (expr.kind === "static_call" &&
      staticSendFunctions.includes(expr.function?.text || "")) ||
    (expr.kind === "method_call" &&
      isSelf(expr.self) &&
      selfMethodSendFunctions.includes(expr.method?.text || ""))
  );
}
