import {
  AstExpression,
  AstNode,
  AstStatement,
  tryExtractPath,
} from "../../internals/tact/imports";
import { InternalException } from "../exceptions";
import { unreachable } from "../util";

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
 * @param flatStmts If true, only traverse statement expressions at the current
 *                  level without going into nested statements.
 */
export function forEachExpression(
  node: AstNode,
  callback: (expr: AstExpression) => void,
  { flatStmts = false }: Partial<{ flatStmts: boolean }> = {},
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
      case "map_literal":
        expr.fields.forEach((f) => {
          traverseExpression(f.key);
          traverseExpression(f.value);
        });
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
      case "map_value":
      case "set_literal":
      case "number":
      case "boolean":
      case "id":
      case "code_of":
      case "address":
      case "cell":
      case "struct_value":
      case "slice":
      case "null":
        // Primitives and non-composite expressions don't require further traversal
        break;
      default:
        unreachable(expr);
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
      case "statement_destruct":
        traverseExpression(stmt.expression);
        break;
      case "statement_return":
        if (stmt.expression) traverseExpression(stmt.expression);
        break;
      case "statement_condition":
        traverseExpression(stmt.condition);
        if (!flatStmts) stmt.trueStatements.forEach(traverseStatement);
        if (!flatStmts && stmt.falseStatements)
          stmt.falseStatements.forEach(traverseStatement);
        break;
      case "statement_while":
      case "statement_until":
        traverseExpression(stmt.condition);
        if (!flatStmts) stmt.statements.forEach(traverseStatement);
        break;
      case "statement_repeat":
        traverseExpression(stmt.iterations);
        if (!flatStmts) stmt.statements.forEach(traverseStatement);
        break;
      case "statement_foreach":
        if (!flatStmts) stmt.statements.forEach(traverseStatement);
        break;
      case "statement_try":
        if (!flatStmts) {
          stmt.statements.forEach(traverseStatement);
          if (stmt.catchBlock) {
            stmt.catchBlock.catchStatements.forEach(traverseStatement);
          }
        }
        break;
      case "statement_block":
        if (!flatStmts) stmt.statements.forEach(traverseStatement);
        break;
      default:
        unreachable(stmt);
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
        // Do nothing; imports would be processed separately anyway
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
      case "statement_block":
      case "statement_destruct":
      case "statement_foreach":
        traverseStatement(node);
        break;
      case "op_binary":
      case "op_unary":
      case "field_access":
      case "method_call":
      case "static_call":
      case "map_literal":
      case "map_value":
      case "set_literal":
      case "struct_instance":
      case "init_of":
      case "conditional":
      case "string":
      case "address":
      case "cell":
      case "slice":
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
      case "code_of":
      case "destruct_mapping":
      case "destruct_end":
      case "struct_value":
      case "struct_field_value":
      case "internal":
      case "external":
      case "bounce":
      case "simple":
      case "fallback":
      case "comment":
      case "function_attribute":
      case "optional_type":
      case "constant_decl":
      case "asm_function_def":
      case "wildcard":
        // Do nothing
        break;
      default:
        unreachable(node);
    }
  }

  traverseNode(node);
}

/**
 * Recursively searches for an expression in an ASTNode that satisfies the predicate.
 * @param node The node to traverse.
 * @param predicate The predicate function to test each expression.
 * @returns The first expression that satisfies the predicate, or null if none found.
 */
export function findInExpressions(
  node: AstNode,
  predicate: (expr: AstExpression) => boolean,
): AstExpression | null {
  function traverseExpression(expr: AstExpression): AstExpression | null {
    if (predicate(expr)) {
      return expr;
    }

    switch (expr.kind) {
      case "op_binary":
        return traverseExpression(expr.left) || traverseExpression(expr.right);
      case "op_unary":
        return traverseExpression(expr.operand);
      case "map_literal":
        return expr.fields.reduce<AstExpression | null>(
          (found, f) =>
            found || traverseExpression(f.key) || traverseExpression(f.value),
          null,
        );
      case "field_access":
        return traverseExpression(expr.aggregate);
      case "method_call":
        return (
          traverseExpression(expr.self) ||
          expr.args.reduce<AstExpression | null>(
            (found, arg) => found || traverseExpression(arg),
            null,
          )
        );
      case "static_call":
        return expr.args.reduce<AstExpression | null>(
          (found, arg) => found || traverseExpression(arg),
          null,
        );
      case "struct_instance":
        return expr.args.reduce<AstExpression | null>(
          (found, param) => found || traverseExpression(param.initializer),
          null,
        );
      case "init_of":
        return expr.args.reduce<AstExpression | null>(
          (found, arg) => found || traverseExpression(arg),
          null,
        );
      case "conditional":
        return (
          traverseExpression(expr.condition) ||
          traverseExpression(expr.thenBranch) ||
          traverseExpression(expr.elseBranch)
        );
      case "string":
      case "number":
      case "boolean":
      case "id":
      case "code_of":
      case "address":
      case "map_value":
      case "set_literal":
      case "cell":
      case "struct_value":
      case "slice":
      case "null":
        // Primitives and non-composite expressions don't require further traversal
        return null;
      default:
        unreachable(expr);
    }
  }

  function traverseStatement(stmt: AstStatement): AstExpression | null {
    switch (stmt.kind) {
      case "statement_assign":
      case "statement_augmentedassign":
        return (
          traverseExpression(stmt.path) || traverseExpression(stmt.expression)
        );
      case "statement_let":
      case "statement_destruct":
      case "statement_expression":
        return traverseExpression(stmt.expression);
      case "statement_return":
        return stmt.expression ? traverseExpression(stmt.expression) : null;
      case "statement_condition":
        return (
          traverseExpression(stmt.condition) ||
          stmt.trueStatements.reduce<AstExpression | null>(
            (found, s) => found || traverseStatement(s),
            null,
          ) ||
          (stmt.falseStatements
            ? stmt.falseStatements.reduce<AstExpression | null>(
                (found, s) => found || traverseStatement(s),
                null,
              )
            : null)
        );
      case "statement_block":
        return stmt.statements.reduce<AstExpression | null>(
          (found, s) => found || traverseStatement(s),
          null,
        );
      case "statement_while":
      case "statement_until":
        return (
          traverseExpression(stmt.condition) ||
          stmt.statements.reduce<AstExpression | null>(
            (found, s) => found || traverseStatement(s),
            null,
          )
        );
      case "statement_repeat":
        return (
          traverseExpression(stmt.iterations) ||
          stmt.statements.reduce<AstExpression | null>(
            (found, s) => found || traverseStatement(s),
            null,
          )
        );
      case "statement_try":
        const bodyResult = stmt.statements.reduce<AstExpression | null>(
          (found, s) => found || traverseStatement(s),
          null,
        );
        if (bodyResult) return bodyResult;
        if (stmt.catchBlock) {
          return stmt.catchBlock.catchStatements.reduce<AstExpression | null>(
            (found, s) => found || traverseStatement(s),
            null,
          );
        }
        return null;
      case "statement_foreach":
        return stmt.statements.reduce<AstExpression | null>(
          (found, s) => found || traverseStatement(s),
          null,
        );
      default:
        unreachable(stmt);
    }
  }

  function traverseNode(node: AstNode): AstExpression | null {
    switch (node.kind) {
      case "module":
        return node.items.reduce<AstExpression | null>(
          (found, item) => found || traverseNode(item),
          null,
        );
      case "native_function_decl":
      case "struct_decl":
      case "message_decl":
      case "primitive_type_decl":
        // These node types do not require further traversal
        return null;
      case "function_def":
      case "contract_init":
      case "receiver":
        return node.statements.reduce<AstExpression | null>(
          (found, stmt) => found || traverseStatement(stmt),
          null,
        );
      case "contract":
      case "trait": {
        for (const decl of node.declarations) {
          const result = traverseNode(decl);
          if (result) return result;
        }
        return null;
      }
      case "field_decl":
        return node.initializer ? traverseExpression(node.initializer) : null;
      case "constant_def":
        return traverseExpression(node.initializer);
      case "import":
        return null; // Imports are handles elsewhere
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
      case "statement_destruct":
      case "statement_block":
      case "statement_foreach":
        return traverseStatement(node);
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
      case "address":
      case "cell":
      case "slice":
      case "id":
      case "null":
      case "map_literal":
      case "map_value":
      case "set_literal":
        return traverseExpression(node);
      case "struct_field_initializer":
        return traverseExpression(node.initializer);
      case "typed_parameter":
      case "type_id":
      case "map_type":
      case "bounced_message_type":
      case "func_id":
      case "function_decl":
      case "optional_type":
      case "constant_decl":
      case "asm_function_def":
      case "code_of":
      case "destruct_mapping":
      case "destruct_end":
      case "struct_value":
      case "struct_field_value":
      case "internal":
      case "external":
      case "bounce":
      case "simple":
      case "fallback":
      case "comment":
      case "function_attribute":
      case "wildcard":
        // Do nothing
        return null;
      default:
        unreachable(node);
    }
  }

  return traverseNode(node);
}

/**
 * Returns true if there are any nested expressions matching the given predicate.
 * @param node The node to traverse.
 * @param predicate The predicate function to test each expression.
 * @returns The first expression that satisfies the predicate, or null if none found.
 */
export function hasInExpressions(
  node: AstNode,
  predicate: (expr: AstExpression) => boolean,
): boolean {
  return null !== findInExpressions(node, predicate);
}

/**
 * Recursively iterates over each expression in an ASTNode and applies a callback to each expression.
 * @param node The node to traverse.
 * @param acc The initial value of the accumulator.
 * @param callback The callback function to apply to each expression.
 * @param options Optional configuration for the traversal.
 * @returns The final value of the accumulator after processing all expressions.
 */
export function foldExpressions<T>(
  node: AstNode,
  callback: (acc: T, expr: AstExpression) => T,
  acc: T,
  options: Partial<{
    shouldContinue: (expr: AstExpression) => boolean;
  }> = {},
): T {
  function traverseExpression(acc: T, expr: AstExpression): T {
    if (options.shouldContinue && !options.shouldContinue(expr)) {
      return acc;
    }

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
      case "map_literal":
        expr.fields.forEach((f) => {
          acc = traverseExpression(acc, f.key);
          acc = traverseExpression(acc, f.value);
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
      case "struct_value":
      case "number":
      case "boolean":
      case "id":
      case "cell":
      case "slice":
      case "address":
      case "null":
      case "code_of":
      case "map_value":
      case "set_literal":
        // Non-composite expressions and literals don't require further traversal
        break;
      default:
        unreachable(expr);
    }
    return acc;
  }

  function traverseStatement(acc: T, stmt: AstStatement): T {
    switch (stmt.kind) {
      case "statement_destruct":
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
        if (stmt.catchBlock) {
          stmt.catchBlock.catchStatements.forEach((st) => {
            acc = traverseStatement(acc, st);
          });
        }
        break;
      case "statement_foreach":
        acc = traverseExpression(acc, stmt.map);
        stmt.statements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        break;
      case "statement_block":
        stmt.statements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        break;
      default:
        unreachable(stmt);
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
        break; // Imports should be handled elsewhere
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
      case "statement_foreach":
      case "statement_destruct":
      case "statement_block":
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
      case "address":
      case "cell":
      case "slice":
      case "null":
      case "map_literal":
      case "map_value":
      case "set_literal":
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
      case "address":
      case "cell":
      case "struct_value":
      case "slice":
      case "asm_function_def":
      case "code_of":
      case "destruct_mapping":
      case "destruct_end":
      case "struct_value":
      case "struct_field_value":
      case "internal":
      case "external":
      case "bounce":
      case "simple":
      case "fallback":
      case "comment":
      case "function_attribute":
      case "wildcard":
        // Do nothing
        break;
      default:
        unreachable(node);
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
      case "statement_destruct":
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
        break;
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_foreach":
      case "statement_block":
        stmt.statements.forEach(traverseStatement);
        break;
      case "statement_try":
        stmt.statements.forEach(traverseStatement);
        if (stmt.catchBlock) {
          stmt.catchBlock.catchStatements.forEach(traverseStatement);
        }
        break;
      default:
        unreachable(stmt);
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
      case "statement_foreach":
      case "statement_destruct":
      case "statement_block":
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
      case "address":
      case "cell":
      case "slice":
      case "map_literal":
      case "map_value":
      case "set_literal":
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
      case "func_id":
      case "function_decl":
      case "optional_type":
      case "import":
      case "primitive_type_decl":
      case "asm_function_def":
      case "code_of":
      case "destruct_mapping":
      case "destruct_end":
      case "struct_value":
      case "struct_field_value":
      case "internal":
      case "external":
      case "bounce":
      case "simple":
      case "fallback":
      case "comment":
      case "function_attribute":
      case "wildcard":
        // Do nothing
        break;
      default:
        unreachable(node);
    }
  }

  traverseNode(node);
}

/**
 * Recursively iterates over each statement in an ASTNode and applies a callback to each statement.
 * @param node The node to traverse.
 * @param acc The initial value of the accumulator.
 * @param callback The callback function to apply to each statement, also passes the accumulator.
 * @param flatStmts If true, only traverse statements at the current level without
 *                  going into nested statements.
 * @returns The final value of the accumulator after processing all statements.
 */
export function foldStatements<T>(
  node: AstNode,
  callback: (acc: T, stmt: AstStatement) => T,
  acc: T,
  { flatStmts = false }: Partial<{ flatStmts: boolean }> = {},
): T {
  function traverseStatement(acc: T, stmt: AstStatement): T {
    acc = callback(acc, stmt);
    if (flatStmts) return acc;

    switch (stmt.kind) {
      case "statement_let":
      case "statement_destruct":
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
        break;
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_foreach":
      case "statement_block":
        stmt.statements.forEach((st) => (acc = traverseStatement(acc, st)));
        break;
      case "statement_try":
        stmt.statements.forEach((st) => (acc = traverseStatement(acc, st)));
        if (stmt.catchBlock) {
          stmt.catchBlock.catchStatements.forEach(
            (st) => (acc = traverseStatement(acc, st)),
          );
        }
        break;
      default:
        unreachable(stmt);
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
      case "statement_destruct":
      case "statement_block":
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
      case "func_id":
      case "optional_type":
      case "field_decl":
      case "import":
      case "primitive_type_decl":
      case "address":
      case "cell":
      case "struct_value":
      case "slice":
      case "asm_function_def":
      case "code_of":
      case "destruct_mapping":
      case "destruct_end":
      case "struct_value":
      case "struct_field_value":
      case "internal":
      case "external":
      case "bounce":
      case "simple":
      case "fallback":
      case "map_literal":
      case "map_value":
      case "set_literal":
      case "comment":
      case "function_attribute":
      case "asm_function_def":
      case "wildcard":
        // Do nothing
        break;
      default:
        unreachable(node);
    }
    return acc;
  }

  return traverseNode(acc, node);
}
