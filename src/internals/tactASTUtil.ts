import {
  ASTNode,
  ASTStatement,
  ASTExpression,
} from "@tact-lang/compiler/dist/grammar/ast";
import JSONbig from "json-bigint";

/**
 * Recursively iterates over each expression in an ASTNode and applies a callback to each expression.
 * @param node The node to traverse.
 * @param callback The callback function to apply to each expression.
 */
export function forEachExpression(
  node: ASTNode,
  callback: (expr: ASTExpression) => void,
): void {
  function traverseExpression(expr: ASTExpression): void {
    callback(expr);

    switch (expr.kind) {
      case "op_binary":
        traverseExpression(expr.left);
        traverseExpression(expr.right);
        break;
      case "op_unary":
        traverseExpression(expr.right);
        break;
      case "op_field":
        traverseExpression(expr.src);
        break;
      case "op_call":
        traverseExpression(expr.src);
        expr.args.forEach(traverseExpression);
        break;
      case "op_static_call":
        expr.args.forEach(traverseExpression);
        break;
      case "op_new":
        expr.args.forEach((param) => traverseExpression(param.exp));
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
      case "lvalue_ref":
        // Primitives and non-composite expressions don't require further traversal
        break;
      default:
        throw new Error(`Unsupported expression: ${JSONbig.stringify(expr)}`);
    }
  }

  function traverseStatement(stmt: ASTStatement): void {
    switch (stmt.kind) {
      case "statement_let":
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_expression":
        traverseExpression(stmt.expression);
        break;
      case "statement_return":
        if (stmt.expression) traverseExpression(stmt.expression);
        break;
      case "statement_condition":
        traverseExpression(stmt.expression);
        stmt.trueStatements.forEach(traverseStatement);
        if (stmt.falseStatements)
          stmt.falseStatements.forEach(traverseStatement);
        if (stmt.elseif) traverseStatement(stmt.elseif);
        break;
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
        traverseExpression(stmt.condition);
        stmt.statements.forEach(traverseStatement);
        break;
      default:
        throw new Error(`Unsupported statement: ${JSONbig.stringify(stmt)}`);
    }
  }

  function traverseNode(node: ASTNode): void {
    if (
      node.kind === "def_function" ||
      node.kind === "def_init_function" ||
      node.kind === "def_receive"
    ) {
      if (node.statements) {
        node.statements.forEach(traverseStatement);
      }
    } else if (node.kind === "def_contract" || node.kind === "def_trait") {
      node.declarations.forEach(traverseNode);
    } else if (node.kind === "def_field") {
      if (node.init) traverseExpression(node.init);
    } else if (node.kind === "def_constant") {
      if (node.value) traverseExpression(node.value);
    } else if (node.kind === "program_import") {
      traverseExpression(node.path);
    } else if (
      node.kind === "statement_let" ||
      node.kind === "statement_assign" ||
      node.kind === "statement_augmentedassign" ||
      node.kind === "statement_return" ||
      node.kind === "statement_expression" ||
      node.kind === "statement_condition" ||
      node.kind === "statement_while" ||
      node.kind === "statement_until" ||
      node.kind === "statement_repeat"
    ) {
      traverseStatement(node);
    } else if (node.kind === "program") {
      node.entries.forEach(traverseNode);
    } else if (
      node.kind === "def_native_function" ||
      node.kind === "def_struct" ||
      node.kind === "primitive"
    ) {
      // Do nothing
    } else {
      throw new Error(`Unsupported node: ${JSONbig.stringify(node)}`);
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
  node: ASTNode,
  acc: T,
  callback: (acc: T, expr: ASTExpression) => T,
): T {
  function traverseExpression(acc: T, expr: ASTExpression): T {
    acc = callback(acc, expr);

    switch (expr.kind) {
      case "op_binary":
        acc = traverseExpression(acc, expr.left);
        acc = traverseExpression(acc, expr.right);
        break;
      case "op_unary":
        acc = traverseExpression(acc, expr.right);
        break;
      case "op_field":
        acc = traverseExpression(acc, expr.src);
        break;
      case "op_call":
        acc = traverseExpression(acc, expr.src);
        expr.args.forEach((arg) => {
          acc = traverseExpression(acc, arg);
        });
        break;
      case "op_static_call":
        expr.args.forEach((arg) => {
          acc = traverseExpression(acc, arg);
        });
        break;
      case "op_new":
        expr.args.forEach((param) => {
          acc = traverseExpression(acc, param.exp);
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
      case "lvalue_ref":
        // Primitives and non-composite expressions don't require further traversal
        break;
      default:
        throw new Error(`Unsupported expression: ${JSONbig.stringify(expr)}`);
    }
    return acc;
  }

  function traverseStatement(acc: T, stmt: ASTStatement): T {
    switch (stmt.kind) {
      case "statement_let":
      case "statement_assign":
      case "statement_augmentedassign":
      case "statement_expression":
        acc = traverseExpression(acc, stmt.expression);
        break;
      case "statement_return":
        if (stmt.expression) acc = traverseExpression(acc, stmt.expression);
        break;
      case "statement_condition":
        acc = traverseExpression(acc, stmt.expression);
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
      case "statement_repeat":
        acc = traverseExpression(acc, stmt.condition);
        stmt.statements.forEach((st) => {
          acc = traverseStatement(acc, st);
        });
        break;
      default:
        throw new Error(`Unsupported statement: ${JSONbig.stringify(stmt)}`);
    }
    return acc;
  }

  function traverseNode(acc: T, node: ASTNode): T {
    if (
      node.kind === "def_function" ||
      node.kind === "def_init_function" ||
      node.kind === "def_receive"
    ) {
      if (node.statements) {
        node.statements.forEach((stmt) => {
          acc = traverseStatement(acc, stmt);
        });
      }
    } else if (node.kind === "def_contract" || node.kind === "def_trait") {
      node.declarations.forEach((decl) => {
        acc = traverseNode(acc, decl);
      });
    } else if (node.kind === "def_field") {
      if (node.init) acc = traverseExpression(acc, node.init);
    } else if (node.kind === "def_constant") {
      if (node.value) acc = traverseExpression(acc, node.value);
    } else if (node.kind === "program_import") {
      acc = traverseExpression(acc, node.path);
    } else if (
      node.kind === "statement_let" ||
      node.kind === "statement_assign" ||
      node.kind === "statement_augmentedassign" ||
      node.kind === "statement_return" ||
      node.kind === "statement_expression" ||
      node.kind === "statement_condition" ||
      node.kind === "statement_while" ||
      node.kind === "statement_until" ||
      node.kind === "statement_repeat"
    ) {
      acc = traverseStatement(acc, node);
    } else if (node.kind === "program") {
      node.entries.forEach((entry) => {
        acc = traverseNode(acc, entry);
      });
    } else if (
      node.kind === "def_native_function" ||
      node.kind === "def_struct" ||
      node.kind === "primitive"
    ) {
      // Do nothing
    } else {
      throw new Error(`Unsupported node: ${JSONbig.stringify(node)}`);
    }
    return acc;
  }

  return traverseNode(acc, node);
}
