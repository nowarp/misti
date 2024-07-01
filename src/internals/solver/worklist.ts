import { JoinSemilattice } from "../lattice";
import { CFG, Node, CompilationUnit, getPredecessors } from "../ir";
import { SolverResults } from "./results";
import { Solver } from "./solver";
import { Transfer } from "../transfer";

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

  /**
   * @param transfer An object that defines the transfer operation for a node and its state.
   * @param lattice An instance of a lattice that defines the join, bottom, and leq operations.
   */
  constructor(
    cu: CompilationUnit,
    cfg: CFG,
    transfer: Transfer<State>,
    lattice: JoinSemilattice<State>,
  ) {
    this.cu = cu;
    this.cfg = cfg;
    this.transfer = transfer;
    this.lattice = lattice;
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
      const inState = getPredecessors(this.cfg, node).reduce((acc, pred) => {
        return this.lattice.join(acc, results.getState(pred.idx)!);
      }, this.lattice.bottom());

      const stmt = this.cu.ast.getStatement(node.stmtID);
      if (stmt === undefined) {
        throw new Error(
          `Cannot find statement #${node.stmtID} defined within node #${node.idx}`,
        );
      }
      const outState = this.transfer.transfer(inState, node, stmt);

      if (!this.lattice.leq(outState, results.getState(node.idx)!)) {
        results.setState(node.idx, outState);
        worklist.push(...getPredecessors(this.cfg, node));
      }
    }

    return results;
  }

  public solve(): SolverResults<State> {
    return this.findFixpoint();
  }
}
