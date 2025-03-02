import {
  CompilerContext,
  AstExpression,
  evalConstantExpression,
  getAstUtil,
  getAstFactory,
  AstLiteral,
  dummySrcInfo,
} from "../../internals/tact/imports";

/**
 * Supported literal kinds:
 * https://github.com/tact-lang/tact/blob/0a6c6880144642105948e0b8361cf3f54cdec001/src/optimizer/interpreter.ts#L99
 */
export type LiteralKind =
  | "address"
  | "boolean"
  | "cell"
  | "null"
  | "number"
  | "simplified_string"
  | "slice"
  | "struct_value";

/**
 * Evaluates a constant expression and returns its value.
 *
 * @param expr The AST expression to evaluate.
 * @returns The evaluated constant value, or undefined if evaluation fails.
 */
export function evalExpr(expr: AstExpression): AstLiteral | undefined {
  try {
    const util = getAstUtil(getAstFactory());
    return evalConstantExpression(expr, new CompilerContext(), util);
  } catch {
    return undefined;
  }
}

/**
 * Evaluates the given expression to a constant value and checks if it matches
 * the expected type.
 *
 * @param expr The expression to evaluate.
 * @param expectedKind The expected kind of the result.
 * @returns The evaluated value if it matches the expected type, undefined otherwise.
 */
export function evalToType(
  expr: AstExpression,
  expectedKind: LiteralKind,
): AstLiteral | undefined {
  const lit = evalExpr(expr);
  return lit !== undefined && lit.kind === expectedKind ? lit : undefined;
}

/**
 * Evaluates the given expression to a literal and checks if it matches
 * the expected type and value.
 *
 * @param expr The expression to evaluate.
 * @param expectedKind The expected kind of the result.
 * @param expected The expected result.
 * @returns True if the expression can be evaluated to a constant value that
 *          matches the expected type and value, false otherwise.
 */
export function evalsToLiteral(
  expr: AstExpression,
  expected: AstLiteral,
): boolean {
  const result = evalExpr(expr);
  return (
    result !== undefined && result.kind === expected.kind && result === expected
  );
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
  predicate: (lit: any) => boolean,
): boolean {
  const lit = evalExpr(expr);
  return lit !== undefined && predicate(lit);
}

/**
 * Wraps an OOP API into into something a sane developer might actually want to use.
 */
export class MakeLiteral {
  public static boolean(value: boolean) {
    return getAstUtil(getAstFactory()).makeBooleanLiteral(value, dummySrcInfo);
  }
  public static number(value: bigint) {
    return getAstUtil(getAstFactory()).makeNumberLiteral(value, dummySrcInfo);
  }
}
