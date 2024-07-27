import { AstNode, SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";
import JSONbig from "json-bigint";

const REPORT_TEXT =
  "Please report this output and the input sources to https://github.com/nowarp/misti/issues/new";

export class TactException {
  private constructor() {}
  static make(error: unknown): Error {
    if (error instanceof Error) {
      return new Error(
        [
          "Internal Tact Compiler Error:",
          error.message,
          error.stack,
          "",
          REPORT_TEXT,
        ].join("\n"),
      );
    } else {
      throw error;
    }
  }
}

export class InternalException {
  private constructor() {}
  static make(
    msg: string,
    params: Partial<{ loc?: SrcInfo; node?: AstNode }> = {},
  ): Error {
    const { loc = undefined, node = undefined } = params;
    const locStr = loc
      ? (() => {
          const { lineNum, colNum } = loc.interval.getLineAndColumn();
          return lineNum !== 0 && colNum !== 0
            ? ` at ${lineNum}:${colNum}`
            : "";
        })()
      : "";
    throw new Error(
      [
        `Internal Misti Error${locStr}:`,
        msg,
        ...(node === undefined
          ? []
          : [`AST node:\n${JSONbig.stringify(node, null, 2)}`]),
        REPORT_TEXT,
      ].join("\n"),
    );
  }
}
