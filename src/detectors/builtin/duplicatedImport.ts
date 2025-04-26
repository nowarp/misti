import { CompilationUnit, ImportNodeIdx } from "../../internals/ir";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that warns about duplicated imports.
 *
 * ## Why is it bad?
 * Duplicated imports lead to compilation time overhead and might reveal poor
 * contract design when a developer forgets to add a real import.
 *
 * ## Example
 * ```tact
 * import "./utils";
 * import "./utils.tact";
 * ```
 *
 * Use instead:
 * ```tact
 * import "./utils";
 * ```
 */
export class DuplicatedImport extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    const warnings: Warning[] = [];
    cu.imports.forEachNode((node) => {
      const visited: Set<ImportNodeIdx> = new Set();
      node.outEdges.forEach((edgeIdx) => {
        const edge = cu.imports.getEdge(edgeIdx)!;
        const dst = cu.imports.getNode(edge.dst)!;
        if (visited.has(dst.idx)) {
          warnings.push(
            this.makeWarning(`Duplicated import`, edge.loc, {
              extraDescription: `\`${dst.filePath}\` is already imported in this file`,
              suggestion: "Remove this import statement",
            }),
          );
        }
        visited.add(dst.idx);
      });
    });
    return warnings;
  }
}
