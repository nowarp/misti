import { MistiContext } from "../../context";
import { ExecutionException } from "../../exceptions";
import { definedInStdlib, getStdlibPath } from "../../tact/stdlib";
import {
  ImportGraph,
  ImportEdge,
  ImportNode,
  ImportNodeIdx,
  ImportLanguage,
} from "../imports";
import {
  throwParseError,
  throwSyntaxError,
} from "@tact-lang/compiler/dist/errors";
import {
  AstNode,
  AstImport,
  SrcInfo,
  createAstNode,
  AstNumberBase,
  AstString,
} from "@tact-lang/compiler/dist/grammar/ast";
import { ItemOrigin } from "@tact-lang/compiler/dist/grammar/grammar";
import tactGrammar from "@tact-lang/compiler/dist/grammar/grammar.ohm-bundle";
import fs from "fs";
import { Node, NonterminalNode } from "ohm-js";
import path from "path";

export class ImportGraphBuilder {
  private constructor(
    private readonly ctx: MistiContext,
    private readonly entryPoints: string[],
  ) {}

  /**
   * Creates an ImportGraphBuilder.
   *
   * @param ctx Misti context.
   * @param entryPoints Absolute paths to entry points to build import graph from.
   */
  public static make(
    ctx: MistiContext,
    entryPoints: string[],
  ): ImportGraphBuilder {
    return new ImportGraphBuilder(ctx, entryPoints);
  }

  public build(): ImportGraph {
    const nodes: ImportNode[] = [];
    const edges: ImportEdge[] = [];
    const visited = new Set<string>();
    this.entryPoints.forEach((e) => this.processFile(e, nodes, edges, visited));
    return new ImportGraph(nodes, edges);
  }

  private processFile(
    filePath: string,
    nodes: ImportNode[],
    edges: ImportEdge[],
    visited: Set<string>,
  ): ImportNodeIdx {
    if (visited.has(filePath)) {
      return nodes.find((node) => node.importPath === filePath)!.idx;
    }
    visited.add(filePath);

    const fileContent = fs.readFileSync(filePath, "utf8");
    const imports = ParserHack.parseImports(fileContent, filePath, "user");
    const node = new ImportNode(
      this.generateNodeName(filePath),
      definedInStdlib(this.ctx, filePath) ? "stdlib" : "user",
      filePath,
      this.determineLanguage(filePath),
      this.hasContract(fileContent),
    );
    nodes.push(node);

    imports.reduce((acc, importNode) => {
      const importPath = importNode.path.value;
      const resolvedPath = path.resolve(
        path.dirname(filePath),
        this.resolveStdlibPath(importPath),
      );
      const targetNodeIdx = this.processFile(
        resolvedPath,
        nodes,
        edges,
        visited,
      );
      const edge = new ImportEdge(node.idx, targetNodeIdx, importNode.loc);
      edges.push(edge);
      node.outEdges.add(edge.idx);
      nodes.find((n) => n.idx === targetNodeIdx)?.inEdges.add(edge.idx);
      return acc;
    }, undefined);

    return node.idx;
  }

  /**
   * Returns the absolute path to the stdlib/libs directory.
   */
  private getStdlibLibsPath(): string {
    const libsDir = "libs"; // Tact sources: stdlib/libs/
    return path.resolve(getStdlibPath(), libsDir);
  }

  /**
   * Returns the absolute path to the stdlib location if the given path
   * starts with `@stdlib`. Otherwise, returns the path unchanged.
   *
   * Tact API doesn't provide functions to work with paths, so we replicate this:
   * https://github.com/tact-lang/tact/blob/2315d035f5f9a22cad42657561c1a0eaef997b05/src/imports/resolveLibrary.ts#L26
   */
  private resolveStdlibPath(importPath: string): string {
    const stdlibPrefix = "@stdlib/";
    if (!importPath.startsWith(stdlibPrefix)) {
      return importPath;
    }
    const libraryName = `${importPath.substring(stdlibPrefix.length)}.tact`;
    return path.resolve(this.getStdlibLibsPath(), libraryName);
  }

  /**
   * Determines the language of a file based on its extension.
   * @throws ExecutionException if the language cannot be determined.
   */
  private determineLanguage(filePath: string): ImportLanguage | never {
    return filePath.endsWith(".tact")
      ? "tact"
      : filePath.endsWith(".func")
        ? "func"
        : (() => {
            throw ExecutionException.make(
              `Cannot determine the target language of import: ${filePath}`,
            );
          })();
  }

  /**
   * Generates a node name for the import graph based on the file path.
   */
  private generateNodeName(filePath: string): string {
    const basename = path.basename(filePath);
    const basenameWithoutExtension = basename.replace(/\.(tact|func)$/, "");
    if (definedInStdlib(this.ctx, filePath)) {
      const relativePath = path.relative(this.getStdlibLibsPath(), filePath);
      return `@stdlib/${relativePath}`.replace(/\\/g, "/");
    }
    return basenameWithoutExtension;
  }

  private hasContract(fileContent: string): boolean {
    return /contract[\t\n\r\u2028\u2029 ]/.test(fileContent);
  }
}

// TODO: Should be removed when https://github.com/tact-lang/tact/issues/965 is fixed.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ParserHack {
  let CURRENT_FILE: string | null;
  let ORIGIN: ItemOrigin | null;

  function inFile<T>(path: string, callback: () => T) {
    CURRENT_FILE = path;
    const r = callback();
    CURRENT_FILE = null;
    return r;
  }

  // handles binary, octal, decimal and hexadecimal integer literals
  function bigintOfIntLiteral(litString: NonterminalNode): bigint {
    return BigInt(litString.sourceString.replaceAll("_", ""));
  }

  function baseOfIntLiteral(node: NonterminalNode): AstNumberBase {
    const basePrefix = node.sourceString.slice(0, 2).toLowerCase();
    switch (basePrefix) {
      case "0x":
        return 16;
      case "0o":
        return 8;
      case "0b":
        return 2;
      default:
        return 10;
    }
  }

  function astOfNumber(node: Node): AstNode {
    return createAstNode({
      kind: "number",
      base: baseOfIntLiteral(node),
      value: bigintOfIntLiteral(node),
      loc: createRef(node),
    });
  }

  function createRef(s: Node): SrcInfo {
    return new SrcInfo(s.source, CURRENT_FILE, ORIGIN!);
  }

  const semantics = tactGrammar.createSemantics();
  semantics.addOperation<AstNode>("astOfImport", {
    Import(_importKwd, path, _semicolon) {
      const pathAST = path.astOfExpression() as AstString;
      if (pathAST.value.includes("\\")) {
        throwSyntaxError('Import path can\'t contain "\\"', createRef(path));
      }
      return createAstNode({
        kind: "import",
        path: pathAST,
        loc: createRef(this),
      });
    },
  });
  semantics.addOperation<AstImport[]>("astOfJustImports", {
    JustImports(imports, _restOfInput) {
      return imports.children.map((item) => item.astOfImport());
    },
  });
  semantics.addOperation<AstNode>("astOfExpression", {
    // Literals
    integerLiteral(_) {
      // Parses dec, hex, and bin numbers
      return astOfNumber(this);
    },
    integerLiteralDec(_) {
      return astOfNumber(this);
    },
    integerLiteralHex(_0x, _digit, _1, _2) {
      return astOfNumber(this);
    },
    boolLiteral(boolValue) {
      return createAstNode({
        kind: "boolean",
        value: boolValue.sourceString === "true",
        loc: createRef(this),
      });
    },
    id(firstTactIdCharacter, restOfTactId) {
      return createAstNode({
        kind: "id",
        text: firstTactIdCharacter.sourceString + restOfTactId.sourceString,
        loc: createRef(this),
      });
    },
    funcId(firstFuncIdCharacter, restOfFuncId) {
      return createAstNode({
        kind: "func_id",
        text: firstFuncIdCharacter.sourceString + restOfFuncId.sourceString,
        loc: createRef(this),
      });
    },
    null(_nullKwd) {
      return createAstNode({ kind: "null", loc: createRef(this) });
    },
    stringLiteral(_startQuotationMark, string, _endQuotationMark) {
      return createAstNode({
        kind: "string",
        value: string.sourceString,
        loc: createRef(this),
      });
    },
    ExpressionAdd_add(left, _plus, right) {
      return createAstNode({
        kind: "op_binary",
        op: "+",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionAdd_sub(left, _minus, right) {
      return createAstNode({
        kind: "op_binary",
        op: "-",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionMul_div(left, _slash, right) {
      return createAstNode({
        kind: "op_binary",
        op: "/",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionMul_mul(left, _star, right) {
      return createAstNode({
        kind: "op_binary",
        op: "*",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionMul_rem(left, _percent, right) {
      return createAstNode({
        kind: "op_binary",
        op: "%",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionEquality_eq(left, _equalsEquals, right) {
      return createAstNode({
        kind: "op_binary",
        op: "==",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionEquality_not(left, _bangEquals, right) {
      return createAstNode({
        kind: "op_binary",
        op: "!=",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionCompare_gt(left, _rangle, right) {
      return createAstNode({
        kind: "op_binary",
        op: ">",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionCompare_gte(left, _rangleEquals, right) {
      return createAstNode({
        kind: "op_binary",
        op: ">=",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionCompare_lt(left, _langle, right) {
      return createAstNode({
        kind: "op_binary",
        op: "<",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionCompare_lte(left, _langleEquals, right) {
      return createAstNode({
        kind: "op_binary",
        op: "<=",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionOr_or(left, _pipePipe, right) {
      return createAstNode({
        kind: "op_binary",
        op: "||",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionAnd_and(left, _ampersandAmpersand, right) {
      return createAstNode({
        kind: "op_binary",
        op: "&&",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionBitwiseShift_shr(left, _rangleRangle, right) {
      return createAstNode({
        kind: "op_binary",
        op: ">>",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionBitwiseShift_shl(left, _langleLangle, right) {
      return createAstNode({
        kind: "op_binary",
        op: "<<",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionBitwiseAnd_bitwiseAnd(left, _ampersand, right) {
      return createAstNode({
        kind: "op_binary",
        op: "&",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionBitwiseOr_bitwiseOr(left, _pipe, right) {
      return createAstNode({
        kind: "op_binary",
        op: "|",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionBitwiseXor_bitwiseXor(left, _caret, right) {
      return createAstNode({
        kind: "op_binary",
        op: "^",
        left: left.astOfExpression(),
        right: right.astOfExpression(),
        loc: createRef(this),
      });
    },

    // Unary
    ExpressionUnary_plus(_plus, operand) {
      return createAstNode({
        kind: "op_unary",
        op: "+",
        operand: operand.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionUnary_minus(_minus, operand) {
      return createAstNode({
        kind: "op_unary",
        op: "-",
        operand: operand.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionUnary_not(_bang, operand) {
      return createAstNode({
        kind: "op_unary",
        op: "!",
        operand: operand.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionUnary_bitwiseNot(_tilde, operand) {
      return createAstNode({
        kind: "op_unary",
        op: "~",
        operand: operand.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionParens(_lparen, expression, _rparen) {
      return expression.astOfExpression();
    },
    ExpressionUnboxNotNull(operand, _bangBang) {
      return createAstNode({
        kind: "op_unary",
        op: "!!",
        operand: operand.astOfExpression(),
        loc: createRef(this),
      });
    },

    ExpressionFieldAccess(source, _dot, fieldId) {
      return createAstNode({
        kind: "field_access",
        aggregate: source.astOfExpression(),
        field: fieldId.astOfExpression(),
        loc: createRef(this),
      });
    },
    ExpressionMethodCall(source, _dot, methodId, methodArguments) {
      return createAstNode({
        kind: "method_call",
        self: source.astOfExpression(),
        method: methodId.astOfExpression(),
        args: methodArguments.astsOfList(),
        loc: createRef(this),
      });
    },
    ExpressionStaticCall(functionId, functionArguments) {
      return createAstNode({
        kind: "static_call",
        function: functionId.astOfExpression(),
        args: functionArguments.astsOfList(),
        loc: createRef(this),
      });
    },
    ExpressionStructInstance(
      typeId,
      _lbrace,
      structFields,
      optTrailingComma,
      _rbrace,
    ) {
      if (
        structFields.source.contents === "" &&
        optTrailingComma.sourceString === ","
      ) {
        throwSyntaxError(
          "Empty parameter list should not have a dangling comma.",
          createRef(optTrailingComma),
        );
      }

      return createAstNode({
        kind: "struct_instance",
        type: typeId.astOfType(),
        args: structFields
          .asIteration()
          .children.map((d) => d.astOfDeclaration()),
        loc: createRef(this),
      });
    },
    ExpressionInitOf(_initOfKwd, contractId, initArguments) {
      return createAstNode({
        kind: "init_of",
        contract: contractId.astOfExpression(),
        args: initArguments.astsOfList(),
        loc: createRef(this),
      });
    },

    // Ternary conditional
    ExpressionConditional_ternary(
      condition,
      _questionMark,
      thenExpression,
      _colon,
      elseExpression,
    ) {
      return createAstNode({
        kind: "conditional",
        condition: condition.astOfExpression(),
        thenBranch: thenExpression.astOfExpression(),
        elseBranch: elseExpression.astOfExpression(),
        loc: createRef(this),
      });
    },
  });

  /**
   * Parses `import` statements.
   *
   * Replicates `parseImports` from Tact keeping an additional information about parsed nodes:
   * https://github.com/tact-lang/tact/blob/2315d035f5f9a22cad42657561c1a0eaef997b05/src/grammar/grammar.ts#L1457
   */
  export function parseImports(
    src: string,
    path: string,
    origin: ItemOrigin,
  ): AstImport[] {
    return inFile(path, () => {
      const matchResult = tactGrammar.match(src, "JustImports");
      if (matchResult.failed()) {
        throwParseError(matchResult, path, origin);
      }
      ORIGIN = origin;
      try {
        return semantics(matchResult).astOfJustImports();
      } finally {
        ORIGIN = null;
      }
    });
  }
}
