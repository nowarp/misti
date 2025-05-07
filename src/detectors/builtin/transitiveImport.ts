import { CompilationUnit, ImportNodeIdx } from "../../internals/ir";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that warns about transitive imports.
 *
 * ## Why is it bad?
 * Tact allows transitive imports, which it should not have in the first place
 * since it might hinder the intended logic.
 *
 * ## Example
 * ```tact
 * // a.tact
 * const Foo: Int = 42;
 *
 * // b.tact
 * import "./a";
 * const Bar: Int = 43;
 *
 * // c.tact
 * import "./b";
 *
 * // here Foo and Bar are both available
 * ```
 *
 * Use instead:
 * ```tact
 * // a.tact
 * const Foo: Int = 42;
 *
 * // b.tact
 * import "./a";
 * const Bar: Int = 43;
 *
 * // c.tact
 * import "./a"; // Fixed: Explicit import
 * import "./b";
 *
 * // here Foo and Bar are both available
 * ```
 */
export class TransitiveImport extends AstDetector {
  severity = Severity.MEDIUM;
  category = Category.BEST_PRACTICES;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    const warnings: Warning[] = [];
    cu.imports.forEachNode((nodeA) => {
      nodeA.outEdges.forEach((edgeIdx) => {
        // Find (implicit) transitive import of C: nodeA --> nodeB --> nodeC
        const a2bEdge = cu.imports.getEdge(edgeIdx)!;
        const aImported: Set<ImportNodeIdx> = Array.from(nodeA.outEdges).reduce(
          (acc, e) => {
            acc.add(cu.imports.getEdge(e)!.dst);
            return acc;
          },
          new Set<ImportNodeIdx>(),
        );
        const nodeB = cu.imports.getNode(a2bEdge.dst)!;
        for (const b2cEdgeIdx of nodeB.outEdges) {
          const b2cEdge = cu.imports.getEdge(b2cEdgeIdx)!;
          const nodeCIdx = b2cEdge.dst;
          if (!aImported.has(nodeCIdx)) {
            const nodeC = cu.imports.getNode(nodeCIdx)!;
            warnings.push(
              this.makeWarning(`Transitive import`, a2bEdge.loc, {
                extraDescription: `\`${nodeB.name}\` exposes exports from \`${nodeC.name}\` making them available in \`${a2bEdge.loc.file}\``,
                suggestion: `Explicitly import \`${nodeC.name}\` in \`${a2bEdge.loc.file}\``,
              }),
            );
          }
        }
      });
    });
    return warnings;
  }
}
