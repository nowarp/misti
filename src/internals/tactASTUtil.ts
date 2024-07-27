import {
  AstNode,
  AstExpression,
  AstStatement,
  tryExtractPath,
} from "@tact-lang/compiler/dist/grammar/ast";

export function extractPath(path: AstExpression): string {
  const result = tryExtractPath(path);
  if (result === null) {
    // TODO: Drop a specific internal error
    throw new Error("Impossible");
  }
  return result.map((v) => v.text).join(".");
}

// A fixed version of `forEachExpression` not available in the Tact upstream yet.
// TODO: Use the Tact API version after #33 is resolved.
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
        throw new Error("Unsupported expression");
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
        throw new Error("Unsupported statement");
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
        // Do nothing
        break;
      default:
        throw new Error("Unsupported node");
    }
  }

  traverseNode(node);
}
