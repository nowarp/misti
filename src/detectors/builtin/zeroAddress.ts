import { Detector } from "../detector";
import { MistiContext } from "../../internals/context";
import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tactASTUtil";
import { createError, MistiTactError, Severity } from "../../internals/errors";
import { ASTExpression } from "@tact-lang/compiler/dist/grammar/ast";

function findZeroAddress(
  acc: MistiTactError[],
  expr: ASTExpression,
): MistiTactError[] {
  if (expr.kind === "op_static_call") {
    if (
      expr.name === "newAddress" &&
      expr.args.length === 2 &&
      expr.args[1].kind === "number" &&
      expr.args[1].value === 0n
    ) {
      acc.push(
        createError("Using zero address", Severity.MEDIUM, expr.args[1].ref),
      );
    }
  }
  return acc;
}

/**
 * A detector that identifies uses of zero address.
 *
 * Using the zero address in smart contracts is typically problematic because it can be
 * exploited as a default or uninitialized address, leading to unintended transfers and
 * security vulnerabilities. Additionally, operations involving the zero address can
 * result in loss of funds or tokens, as there is no private key to access this address.
 */
export class ZeroAddress extends Detector {
  check(_ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(foldExpressions(node, [], findZeroAddress));
    }, [] as MistiTactError[]);
  }
}
