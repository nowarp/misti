import { MistiContext } from "../../context";
import { ExecutionException } from "../../exceptions";
import {
  getParser,
  getAstFactory,
  Source,
  importAsString,
} from "../../tact/imports";
import { definedInStdlib, getStdlibPath } from "../../tact/stdlib";
import {
  ImportGraph,
  ImportEdge,
  ImportNode,
  ImportNodeIdx,
  ImportLanguage,
} from "../imports";
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

    let fileContent = "";
    try {
      fileContent = this.ctx.config.fs.readFile(filePath).toString("utf8");
    } catch {
      this.ctx.logger.warn(
        `Cannot find imported file: ${filePath}. The analysis might not work.`,
      );
    }
    const imports = getParser(getAstFactory(), "old").parseImports({
      code: fileContent,
      path: filePath,
      origin: "user",
    } as Source);
    const node = new ImportNode(
      this.generateNodeName(filePath),
      definedInStdlib(this.ctx, filePath) ? "stdlib" : "user",
      filePath,
      this.determineLanguage(filePath),
      this.hasContract(fileContent),
    );
    nodes.push(node);

    imports.reduce((acc, importNode) => {
      let importPath =
        importNode.importPath.type === "stdlib"
          ? this.resolveStdlibPath(importAsString(importNode.importPath.path))
          : path.resolve(
              path.dirname(filePath),
              importAsString(importNode.importPath.path),
            );
      // TODO: We should use a Tact API function call when this is fixed:
      //       https://github.com/tact-lang/tact/issues/982
      importPath =
        importPath.endsWith(".tact") || importPath.endsWith(".fc")
          ? importPath
          : importPath + ".tact";
      const targetNodeIdx = this.processFile(importPath, nodes, edges, visited);
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
    const libsDir = "libs"; // Tact sources: src/stdlib/libs/
    return path.resolve(getStdlibPath(), libsDir);
  }

  /**
   * Returns the absolute path to the stdlib location if the given path
   * starts with `@stdlib`. Otherwise, returns the path unchanged.
   *
   * Tact API doesn't provide functions to work with paths, so we replicate this:
   * https://github.com/tact-lang/tact/blob/2315d035f5f9a22cad42657561c1a0eaef997b05/src/imports/resolveLibrary.ts#L26
   *
   * TODO: Should be replaced when https://github.com/tact-lang/tact/issues/982 is implemented.
   */
  private resolveStdlibPath(importPath: string): string {
    return path.resolve(this.getStdlibLibsPath(), importPath);
  }

  /**
   * Determines the language of a file based on its extension.
   * @throws ExecutionException if the language cannot be determined.
   */
  private determineLanguage(filePath: string): ImportLanguage | never {
    return filePath.endsWith(".tact")
      ? "tact"
      : filePath.endsWith(".fc")
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
    const basenameWithoutExtension = basename.replace(/\.(tact|func|fc)$/, "");
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
