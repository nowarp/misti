import { Detector } from "../detector";
import { MistiContext } from "../../internals/context";
import { CompilationUnit } from "../../internals/ir";
import { foldExpressions } from "../../internals/tactASTUtil";
import {
  createError,
  makeDocURL,
  MistiTactError,
  Severity,
} from "../../internals/errors";
import { ASTExpression } from "@tact-lang/compiler/dist/grammar/ast";

function findZeroAddress(
  ctx: MistiContext,
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
        createError(
          ctx,
          "Using Zero Address",
          Severity.MEDIUM,
          expr.args[1].ref,
          {
            docURL: makeDocURL("zeroAddress"),
            suggestion: "Consider changing code to avoid using it",
          },
        ),
      );
    }
  }
  return acc;
}

/**
 * A detector that identifies uses of the zero address.
 *
 * ## Why is it bad?
 * Using the zero address in smart contracts is typically problematic because it can be
 * exploited as a default or uninitialized address, leading to unintended transfers and
 * security vulnerabilities. Additionally, operations involving the zero address can
 * result in loss of funds or tokens, as there is no private key to access this address.
 *
 * ## Example
 * ```tact
 * contract Proxy {
 *   to: Address;
 *   init() {
 *     // Warning: Insecure usage of zero address as default value
 *     self.to = newAddress(0, 0);
 *   }
 *   fun setAddress(to: Address) {
 *     self.to = to
 *   }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Proxy {
 *   to: Address;
 *   init(to: Address) {
 *     // Fixed: Using the input value on initializaiton.
 *     self.to = to;
 *   }
 *   fun setAddress(to: Address) {
 *     self.to = to
 *   }
 * }
 * ```
 */
export class ZeroAddress extends Detector {
  check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    return cu.ast.getProgramEntries().reduce((acc, node) => {
      return acc.concat(
        foldExpressions(node, [] as MistiTactError[], (acc, expr) => {
          return findZeroAddress(ctx, acc, expr);
        }),
      );
    }, [] as MistiTactError[]);
  }
}
