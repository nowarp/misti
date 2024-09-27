import { InternalException } from "./exceptions";
import { AstComparator } from "@tact-lang/compiler/dist/";
import {
  AstExpression,
  AstNode,
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

export function extractPath(path: AstExpression): string {
  const result = tryExtractPath(path);
  if (result === null) {
    throw InternalException.make("Impossible path", {
      loc: path.loc,
      node: path,
    });
  }
  return result.map((v) => v.text).join(".");
}

/**
 * Recursively iterates over each expression in an ASTNode and applies a callback to each expression.
 * @param node The node to traverse.
 * @param callback The callback function to apply to each expression.
 */
export function forEachExpression(
  node: AstNode,
  callback: (expr: AstExpression) => void,
): void {
  function traverseExpression(expr: AstExpression): void {
    callback(expr);

    switch (expr.kind) {
      case "op_binary":
        traverseExpression(expr.left);
        traverseExpression(expr.right);
        break;
      case "op_unary":
        traverseExpression(expr.operand);
        break;
      case "field_access":
        traverseExpression(expr.aggregate);
        break;
      case "method_call":
        traverseExpression(expr.self);
        expr.args.forEach(traverseExpression);
        break;
      case "static_call":
        expr.args.forEach(traverseExpression);
        break;
      case "struct_instance":
        expr.args.forEach((param) => {
          traverseExpression(param.initializer);
        });
        break;
      case "init_of":
        expr.args.forEach(traverseExpression);
        break;
      case "conditional":
        traverseExpression(expr.condition);
        traverseExpression(expr.thenBranch);
        traverseExpression(expr.elseBranch);
        break;
      case "string":
      case "number":
      case "boolean":
      case "id":
      case "null":
        // Primitives and non-composite expressions don't require further traversal
        break;
      default:
        throw InternalException.make("Unsupported expression", { node: expr });
    }
  }

  function traverseStatement(stmt: AstStatement): void {
    switch (stmt.kind) {
      case "statement_assign":
      case "statement_augmentedassign":
        traverseExpression(stmt.path);
        traverseExpression(stmt.expression);
        break;
      case "statement_let":
      case "statement_expression":
        traverseExpression(stmt.expression);
        break;
      case "statement_return":
        if (stmt.expression) traverseExpression(stmt.expression);
        break;
      case "statement_condition":
        traverseExpression(stmt.condition);
        stmt.trueStatements.forEach(traverseStatement);
        if (stmt.falseStatements)
          stmt.falseStatements.forEach(traverseStatement);
        if (stmt.elseif) traverseStatement(stmt.elseif);
        break;
      case "statement_while":
      case "statement_until":
        traverseExpression(stmt.condition);
        stmt.statements.forEach(traverseStatement);
        break;
      case "statement_repeat":
        traverseExpression(stmt.iterations);
        stmt.statements.forEach(traverseStatement);
        break;
      case "statement_try":
      case "statement_foreach":
        stmt.statements.forEach(traverseStatement);
        break;
      case "statement_try_catch":
        stmt.statements.forEach(traverseStatement);
        stmt.catchStatements.forEach(traverseStatement);
        break;
      default:
        throw InternalException.make("Unsupported statement", { node: stmt });
    }
  }

  function traverseNode(node: AstNode): void {
    switch (node.kind) {
      case "module":
        node.items.forEach(traverseNode);
        break;
      case "native_function_decl":
      case "struct_decl":
      case "message_decl":
      case "primitive_type_decl":
        // These node types do not require further traversal of expressions or sub-nodes
        break;
      case "function_def":
      case "contract_init":
      case "receiver":
        node.statements.forEach(traverseStatement);
        break;
      case "contract":
      case "trait":
        node.declarations.forEach(traverseNode);
        break;
      case "field_decl":
        if (node.initializer) {
          traverseExpression(node.initializer);
        }
        break;
      case "constant_def":
        traverseExpression(node.initializer);
        break;
      case "import":
        traverseExpression(node.path);
        break;
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_let":
      case "statement_return":
      case "statement_expression":
      case "statement_condition":
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_try":
      case "statement_try_catch":
      case "statement_foreach":
        traverseStatement(node);
        break;
      case "op_binary":
      case "op_unary":
      case "field_access":
      case "method_call":
      case "static_call":
      case "struct_instance":
      case "init_of":
      case "conditional":
      case "string":
      case "number":
      case "boolean":
      case "id":
      case "null":
        traverseExpression(node);
        break;
      case "struct_field_initializer":
        traverseExpression(node.initializer);
        break;
      case "typed_parameter":
      case "type_id":
      case "map_type":
      case "bounced_message_type":
      case "func_id":
      case "function_decl":
      case "optional_type":
      case "constant_decl":
      case "asm_function_def":
        // Do nothing
        break;
      default:
        throw InternalException.make("Unsupported node", { node });
    }
  }

  traverseNode(node);
}

/**
 * Recursively iterates over each expression in an ASTNode and applies a callback to each expression.
 * @param node The node to traverse.
 * @param acc The initial value of the accumulator.
 * @param callback The callback function to apply to each expression.
 * @returns The final value of the accumulator after processing all expressions.
 */
export function foldExpressions<T>(
  node: AstNode,
  acc: T,
  callback: (acc: T, expr: AstExpression) => T,
): T {
  function traverseExpression(acc: T, expr: AstExpression): T {
    acc = callback(acc, expr);

    switch (expr.kind) {
      case "op_binary":
        acc = traverseExpression(acc, expr.left);
        acc = traverseExpression(acc, expr.right);
        break;
      case "op_unary":
        acc = traverseExpression(acc, expr.operand);
        break;
      case "field_access":
        acc = traverseExpression(acc, expr.field);
        acc = traverseExpression(acc, expr.aggregate);
        break;
      case "method_call":
        acc = traverseExpression(acc, expr.self);
        expr.args.forEach((arg) => {
          acc = traverseExpression(acc, arg);
        });
        break;
      case "static_call":
        expr.args.forEach((arg) => {
          acc = traverseExpression(acc, arg);
        });
        break;
      case "struct_instance":
        expr.args.forEach((param) => {
          acc = traverseExpression(acc, param.initializer);
        });
        break;
      case "init_of":
        expr.args.forEach((arg) => {
          acc = traverseExpression(acc, arg);
        });
        break;
      case "conditional":
        acc = traverseExpression(acc, expr.condition);
        acc = traverseExpression(acc, expr.thenBranch);
        acc = traverseExpression(acc, expr.elseBranch);
        break;
      case "string":
      case "number":
      case "boolean":
      case "id":
      case "null":
        // Primitives and non-composite expressions don't require further traversal
        break;
      default:
        throw InternalException.make("Unsupported expression", { node: expr });
    }
    return acc;
  }

  function traverseStatement(acc: T, stmt: AstStatement): T {
    switch (stmt.kind) {
      case "statement_let":
      case "statement_expression":
        acc = traverseExpression(acc, stmt.expression);
        break;
      case "statement_assign":
      case "statement_augmentedassign":
        acc = traverseExpression(acc, stmt.path);
        acc = traverseExpression(acc, stmt.expression);
        break;
      case "statement_return":
        if (stmt.expression) acc = traverseExpression(acc, stmt.expression);
        break;
      case "statement_condition":
        acc = traverseExpression(acc, stmt.condition);
        stmt.trueStatements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        if (stmt.falseStatements)
          stmt.falseStatements.forEach((st) => {
            acc = traverseStatement(acc, st);
          });
        if (stmt.elseif) acc = traverseStatement(acc, stmt.elseif);
        break;
      case "statement_while":
      case "statement_until":
        acc = traverseExpression(acc, stmt.condition);
        stmt.statements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        break;
      case "statement_repeat":
        acc = traverseExpression(acc, stmt.iterations);
        stmt.statements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        break;
      case "statement_try":
        stmt.statements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        break;
      case "statement_try_catch":
        stmt.statements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        stmt.catchStatements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        break;
      case "statement_foreach":
        acc = traverseExpression(acc, stmt.map);
        stmt.statements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        break;
      default:
        throw InternalException.make("Unsupported statement");
    }
    return acc;
  }

  function traverseNode(acc: T, node: AstNode): T {
    switch (node.kind) {
      case "module":
        node.items.forEach((entry) => {
          acc = traverseNode(acc, entry);
        });
        break;
      case "native_function_decl":
      case "struct_decl":
      case "message_decl":
      case "primitive_type_decl":
        // These node types do not require further traversal of expressions or sub-nodes
        break;
      case "function_def":
      case "contract_init":
      case "receiver":
        node.statements.forEach((stmt) => {
          acc = traverseStatement(acc, stmt);
        });
        break;
      case "contract":
      case "trait":
        node.declarations.forEach((decl) => {
          acc = traverseNode(acc, decl);
        });
        break;
      case "field_decl":
        if (node.initializer) {
          acc = traverseExpression(acc, node.initializer);
        }
        break;
      case "constant_def":
        acc = traverseExpression(acc, node.initializer);
        break;
      case "import":
        acc = traverseExpression(acc, node.path);
        break;
      case "statement_let":
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_return":
      case "statement_expression":
      case "statement_condition":
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_try":
      case "statement_try_catch":
      case "statement_foreach":
        acc = traverseStatement(acc, node);
        break;
      case "field_access":
      case "op_binary":
      case "op_unary":
      case "method_call":
      case "static_call":
      case "struct_instance":
      case "init_of":
      case "conditional":
      case "string":
      case "number":
      case "boolean":
      case "id":
      case "null":
        acc = traverseExpression(acc, node);
        break;
      case "struct_field_initializer":
        acc = traverseExpression(acc, node.initializer);
        break;
      case "typed_parameter":
      case "type_id":
      case "map_type":
      case "bounced_message_type":
      case "func_id":
      case "function_decl":
      case "optional_type":
      case "constant_decl":
      case "asm_function_def":
        // Do nothing
        break;
      default:
        throw InternalException.make("Unsupported node", { node });
    }
    return acc;
  }

  return traverseNode(acc, node);
}

/**
 * Recursively iterates over each statement in an ASTNode and applies a callback to each statement.
 * @param node The node to traverse.
 * @param callback The callback function to apply to each statement.
 */
export function forEachStatement(
  node: AstNode,
  callback: (stmt: AstStatement) => void,
): void {
  function traverseStatement(stmt: AstStatement): void {
    callback(stmt);

    switch (stmt.kind) {
      case "statement_let":
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_expression":
        break;
      case "statement_return":
        break;
      case "statement_condition":
        stmt.trueStatements.forEach(traverseStatement);
        if (stmt.falseStatements)
          stmt.falseStatements.forEach(traverseStatement);
        if (stmt.elseif) traverseStatement(stmt.elseif);
        break;
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_try":
      case "statement_foreach":
        stmt.statements.forEach(traverseStatement);
        break;
      case "statement_try_catch":
        stmt.statements.forEach(traverseStatement);
        stmt.catchStatements.forEach(traverseStatement);
        break;
      default:
        throw InternalException.make("Unsupported statement", { node: stmt });
    }
  }

  function traverseNode(node: AstNode): void {
    switch (node.kind) {
      case "module":
        node.items.forEach(traverseNode);
        break;
      case "function_def":
      case "contract_init":
      case "receiver":
        node.statements.forEach(traverseStatement);
        break;
      case "contract":
      case "trait":
        node.declarations.forEach(traverseNode);
        break;
      case "statement_let":
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_return":
      case "statement_expression":
      case "statement_condition":
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_try":
      case "statement_try_catch":
      case "statement_foreach":
        traverseStatement(node);
        break;
      case "op_binary":
      case "op_unary":
      case "field_access":
      case "method_call":
      case "static_call":
      case "struct_instance":
      case "init_of":
      case "conditional":
      case "string":
      case "number":
      case "boolean":
      case "id":
      case "null":
      case "struct_field_initializer":
      case "typed_parameter":
      case "type_id":
      case "map_type":
      case "bounced_message_type":
      case "native_function_decl":
      case "struct_decl":
      case "message_decl":
      case "constant_def":
      case "constant_decl":
      case "field_decl":
      case "import":
      case "primitive_type_decl":
      case "asm_function_def":
        // Do nothing
        break;
      default:
        throw InternalException.make("Unsupported node", { node });
    }
  }

  traverseNode(node);
}

/**
 * Recursively iterates over each statement in an ASTNode and applies a callback to each statement.
 * @param node The node to traverse.
 * @param acc The initial value of the accumulator.
 * @param callback The callback function to apply to each statement, also passes the accumulator.
 * @returns The final value of the accumulator after processing all statements.
 */
export function foldStatements<T>(
  node: AstNode,
  acc: T,
  callback: (acc: T, stmt: AstStatement) => T,
): T {
  function traverseStatement(acc: T, stmt: AstStatement): T {
    acc = callback(acc, stmt);

    switch (stmt.kind) {
      case "statement_let":
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_expression":
        break;
      case "statement_return":
        break;
      case "statement_condition":
        stmt.trueStatements.forEach((st) => (acc = traverseStatement(acc, st)));
        if (stmt.falseStatements)
          stmt.falseStatements.forEach(
            (st) => (acc = traverseStatement(acc, st)),
          );
        if (stmt.elseif) acc = traverseStatement(acc, stmt.elseif);
        break;
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_try":
      case "statement_foreach":
        stmt.statements.forEach((st) => (acc = traverseStatement(acc, st)));
        break;
      case "statement_try_catch":
        stmt.statements.forEach((st) => (acc = traverseStatement(acc, st)));
        stmt.catchStatements.forEach(
          (st) => (acc = traverseStatement(acc, st)),
        );
        break;
      default:
        throw InternalException.make("Unsupported statement", { node: stmt });
    }
    return acc;
  }

  function traverseNode(acc: T, node: AstNode): T {
    switch (node.kind) {
      case "module":
        node.items.forEach((entry) => {
          acc = traverseNode(acc, entry);
        });
        break;
      case "function_def":
      case "contract_init":
      case "receiver":
        node.statements.forEach((stmt) => {
          acc = traverseStatement(acc, stmt);
        });
        break;
      case "contract":
      case "trait":
        node.declarations.forEach((decl) => {
          acc = traverseNode(acc, decl);
        });
        break;
      case "statement_let":
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_return":
      case "statement_expression":
      case "statement_condition":
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_try":
      case "statement_try_catch":
      case "statement_foreach":
        acc = traverseStatement(acc, node);
        break;
      case "op_binary":
      case "op_unary":
      case "field_access":
      case "method_call":
      case "static_call":
      case "struct_instance":
      case "init_of":
      case "conditional":
      case "string":
      case "number":
      case "boolean":
      case "id":
      case "null":
      case "struct_field_initializer":
      case "typed_parameter":
      case "type_id":
      case "map_type":
      case "bounced_message_type":
      case "native_function_decl":
      case "function_decl":
      case "struct_decl":
      case "message_decl":
      case "constant_def":
      case "constant_decl":
      case "field_decl":
      case "import":
      case "primitive_type_decl":
      case "asm_function_def":
        // Do nothing
        break;
      default:
        throw InternalException.make("Unsupported node", { node });
    }
    return acc;
  }

  return traverseNode(acc, node);
}

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
