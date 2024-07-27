import { InternalException } from "../exceptions";
import { JoinSemilattice } from "../lattice";
import {
  CFG,
  Node,
  CompilationUnit,
  getPredecessors,
  getSuccessors,
} from "../ir";
import { SolverResults } from "./results";
import { Solver } from "./solver";
import { Transfer } from "../transfer";

/**
 * Determines the kind of the dataflow analysis.
 *
 * This type is used to specify the direction of the dataflow analysis being performed.
 * - `forward`: Represents a forward dataflow analysis, where information flows from the entry point of a program towards the exit.
 * - `backward`: Represents a backward dataflow analysis, where information flows from the exit point of a program towards the entry.
 *
 * Forward analysis is typically used for problems like reaching definitions, live variable analysis, and constant propagation.
 * Backward analysis is often used for problems such as liveness analysis and backwards slicing.
 */
export type AnalysisKind = "forward" | "backward";

/**
 * Provides a framework for solving dataflow analysis problems by employing a worklist-based algorithm.
 *
 * This class encapsulates the control flow graph (CFG), node state transformations,
 * and lattice properties necessary for the computation of fixpoints in dataflow equations.
 */
export class WorklistSolver<State> implements Solver<State> {
  private readonly cu: CompilationUnit;
  private readonly cfg: CFG;
  private transfer: Transfer<State>;
  private readonly lattice: JoinSemilattice<State>;
  private readonly kind: AnalysisKind;

  /**
   * @param transfer An object that defines the transfer operation for a node and its state.
   * @param lattice An instance of a lattice that defines the join, bottom, and leq operations.
   */
  constructor(
    cu: CompilationUnit,
    cfg: CFG,
    transfer: Transfer<State>,
    lattice: JoinSemilattice<State>,
    kind: AnalysisKind,
  ) {
    this.cu = cu;
    this.cfg = cfg;
    this.transfer = transfer;
    this.lattice = lattice;
    this.kind = kind;
  }

  /**
   * Finds a fixpoint using the worklist algorithm.
   * @returns The results of solving the dataflow problem.
   */
  public findFixpoint(): SolverResults<State> {
    const results = new SolverResults<State>();
    const worklist: Node[] = [...this.cfg.nodes];

    const nodes: Node[] = this.cfg.nodes;
    nodes.forEach((node) => {
      results.setState(node.idx, this.lattice.bottom());
    });

    while (worklist.length > 0) {
      const node = worklist.pop()!;
      const neighbors =
        this.kind === "forward"
          ? getPredecessors(this.cfg, node)
          : getSuccessors(this.cfg, node);

      const inState = neighbors.reduce((acc, neighbor) => {
        return this.lattice.join(acc, results.getState(neighbor.idx)!);
      }, this.lattice.bottom());

      const stmt = this.cu.ast.getStatement(node.stmtID);
      if (stmt === undefined) {
        throw InternalException.make(
          `Cannot find statement #${node.stmtID} defined within node #${node.idx}`,
        );
      }
      const outState = this.transfer.transfer(inState, node, stmt);

      if (!this.lattice.leq(outState, results.getState(node.idx)!)) {
        results.setState(node.idx, outState);
        // Push predecessors or successors based on the analysis kind
        worklist.push(
          ...(this.kind === "forward"
            ? getSuccessors(this.cfg, node)
            : getPredecessors(this.cfg, node)),
        );
      }
    }

    return results;
  }

  public solve(): SolverResults<State> {
    return this.findFixpoint();
  }
}
