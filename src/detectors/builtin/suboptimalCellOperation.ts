import { CompilationUnit } from "../../internals/ir";
import {
  AstStatement,
  idText,
  isSelfId,
  prettyPrint as pp,
} from "../../internals/tact/imports";
import { Category, MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

const SLICE_REPLACEMENTS: Record<
  string,
  { replacement: string; argsNum: number }
> = {
  loadUint: { replacement: "skipUint", argsNum: 1 },
  loadInt: { replacement: "skipInt", argsNum: 1 },
  loadBits: { replacement: "skipBits", argsNum: 1 },
  loadBool: { replacement: "skipBool", argsNum: 0 },
  loadBit: { replacement: "skipBit", argsNum: 0 },
  loadCoins: { replacement: "skipCoins", argsNum: 0 },
  loadVarUint16: { replacement: "skipVarUint16", argsNum: 0 },
  loadVarInt16: { replacement: "skipVarInt16", argsNum: 0 },
  loadVarUint32: { replacement: "skipVarUint32", argsNum: 0 },
  loadVarInt32: { replacement: "skipVarInt32", argsNum: 0 },
  loadAddress: { replacement: "skipAddress", argsNum: 0 },
  loadRef: { replacement: "skipRef", argsNum: 0 },
  loadMaybeRef: { replacement: "skipMaybeRef", argsNum: 0 },
};

/**
 * A detector that highlights `Cell` operations that could be optimized with
 * more gas-effective calls.
 *
 * ### Why is it bad?
 * There are several methods in the stdlib structures that provide a more
 * efficient API for the intended logic.
 *
 * Currently, this detector suggests:
 * * Replacing `load*` with `skip*` when the result is unused.
 *
 * ## Example
 * ```tact
 * fun test(s: Slice) {
 *   s.loadInt(8); // Bad: result is unused
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * fun test(s: Slice) {
 *   s.skipBits(8); // OK
 * }
 * ```
 */
export class SuboptimalCellOperation extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    return Array.from(cu.ast.getFunctions()).reduce((acc, fn) => {
      for (const stmt of fn.statements) {
        const warn = this.warnUnusedLoads(stmt);
        if (warn) acc.push(warn);
      }
      return acc;
    }, [] as MistiTactWarning[]);
  }

  private warnUnusedLoads(stmt: AstStatement): MistiTactWarning | undefined {
    if (
      stmt.kind === "statement_expression" &&
      stmt.expression.kind === "method_call" &&
      // TODO: Ensure that `stmt.expression.self` is `Slice`: https://github.com/nowarp/misti/issues/348
      stmt.expression.self.kind === "id" &&
      !isSelfId(stmt.expression.self)
    ) {
      // We are interested only in `f.method()` calls, not method chains,
      // because they use intermediate results.
      const replacementInfo =
        SLICE_REPLACEMENTS[idText(stmt.expression.method)] || undefined;
      if (
        replacementInfo &&
        stmt.expression.args.length === replacementInfo.argsNum
      ) {
        const argsStr = stmt.expression.args
          .reduce((acc, arg) => {
            acc.push(pp(arg));
            return acc;
          }, [] as string[])
          .join(", ");
        return this.makeWarning(
          `The result of ${pp(stmt)} is unused`,
          stmt.expression.loc,
          {
            suggestion: `Replace it with \`${pp(stmt.expression.self)}.${replacementInfo.replacement}(${argsStr})\``,
          },
        );
      }
    }
    return undefined;
  }
}
