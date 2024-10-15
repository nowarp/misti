import { evalConstantExpression } from "@tact-lang/compiler/dist/constEval";
import { CompilerContext } from "@tact-lang/compiler/dist/context";
import { AstExpression } from "@tact-lang/compiler/dist/grammar/ast";
import {
  Value,
  StructValue,
  CommentValue,
} from "@tact-lang/compiler/dist/types/types";
import { Address, Cell, Slice } from "@ton/core";

/**
 * Evaluates a constant expression and returns its value.
 *
 * @param expr The AST expression to evaluate.
 * @returns The evaluated constant value, or undefined if evaluation fails.
 */
export function evalExpr(expr: AstExpression): Value | undefined {
  try {
    return evalConstantExpression(expr, new CompilerContext());
  } catch {
    return undefined;
  }
}

/**
 * Evaluates the given expression to a constant value and checks if it matches
 * the expected type.
 *
 * @param expr The expression to evaluate.
 * @param expectedType The expected type name as a string.
 * @returns The evaluated value if it matches the expected type, undefined otherwise.
 */
export function evalToType(
  expr: AstExpression,
  expectedType: string,
): Value | undefined {
  const value = evalExpr(expr);
  return value !== undefined && checkType(value, expectedType)
    ? value
    : undefined;
}

/**
 * Evaluates the given expression to a constant value and checks if it matches
 * the expected type and value.
 *
 * @param expr The expression to evaluate.
 * @param expectedType The expected type name as a string.
 * @param expectedValue The expected value.
 * @returns True if the expression can be evaluated to a constant value that
 *          matches the expected type and value, false otherwise.
 */
export function evalsToValue(
  expr: AstExpression,
  expectedType: string,
  expectedValue: Value,
): boolean {
  const value = evalToType(expr, expectedType);
  return value !== undefined && value === expectedValue;
}

/**
 * Evaluates the given expression to a constant value and checks if it satisfies the predicate.
 *
 * @param expr The expression to evaluate.
 * @param predicate The predicate to check.
 * @returns True if the expression can be evaluated to a constant value that satisfies
 *          the predicate, false otherwise.
 */
export function evalsToPredicate(
  expr: AstExpression,
  predicate: (value: any) => boolean,
): boolean {
  const value = evalExpr(expr);
  return value !== undefined && predicate(value);
}

function checkType(value: Value, expectedType: string): boolean {
  switch (expectedType) {
    case "bigint":
      return typeof value === "bigint";
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "null":
      return value === null;
    case "Address":
      return value instanceof Address;
    case "Cell":
      return value instanceof Cell;
    case "Slice":
      return value instanceof Slice;
    case "CommentValue":
      return value instanceof CommentValue;
    case "StructValue":
      return isStructValue(value);
    default:
      return false;
  }
}

function isStructValue(value: any): value is StructValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof CommentValue) &&
    !Address.isAddress(value) &&
    !(value instanceof Cell) &&
    !(value instanceof Slice)
  );
}
