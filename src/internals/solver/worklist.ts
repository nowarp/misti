import { SolverResults } from "./results";
import { Solver } from "./solver";
import { InternalException } from "../exceptions";
import {
  BasicBlock,
  CFG,
  CompilationUnit,
  getPredecessors,
  getSuccessors,
} from "../ir";
import { Semilattice, JoinSemilattice, MeetSemilattice } from "../lattice";
import { Transfer } from "../transfer";

/**
 * Determines the kind of the dataflow analysis.
 *
 * This type is used to specify the direction of the dataflow analysis being performed.
 * - `forward`: Represents a forward dataflow analysis, where information flows from the entry point of a program towards the exit.
 * - `backward`: Represents a backward dataflow analysis, where information flows from the exit point of a program towards the entry.
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
  private readonly lattice: Semilattice<State>;
  private readonly kind: AnalysisKind;

  /**
   * @param transfer An object that defines the transfer operation for a node and its state.
   * @param lattice An instance of a semilattice that defines the necessary operations.
   * @param kind The kind of analysis ("forward" or "backward").
   */
  constructor(
    cu: CompilationUnit,
    cfg: CFG,
    transfer: Transfer<State>,
    lattice: Semilattice<State>,
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
    const worklist: BasicBlock[] = [...this.cfg.nodes];

    const bbs: BasicBlock[] = this.cfg.nodes;

    // Initialize all node states
    bbs.forEach((bb) => {
      if (this.isJoinSemilattice(this.lattice)) {
        results.setState(bb.idx, this.lattice.bottom());
      } else if (this.isMeetSemilattice(this.lattice)) {
        results.setState(bb.idx, this.lattice.top());
      } else {
        throw InternalException.make("Unsupported semilattice type");
      }
    });

    while (worklist.length > 0) {
      const bb = worklist.pop()!;
      const neighbors =
        this.kind === "forward"
          ? getPredecessors(this.cfg, bb)
          : getSuccessors(this.cfg, bb);

      const neighborStates = neighbors.map(
        (neighbor) => results.getState(neighbor.idx)!,
      );

      let inState: State;
      if (this.isJoinSemilattice(this.lattice)) {
        const joinLattice = this.lattice as JoinSemilattice<State>;
        inState = neighborStates.reduce((acc, state) => {
          return joinLattice.join(acc, state);
        }, joinLattice.bottom());
      } else if (this.isMeetSemilattice(this.lattice)) {
        const meetLattice = this.lattice as MeetSemilattice<State>;
        inState = neighborStates.reduce((acc, state) => {
          return meetLattice.meet(acc, state);
        }, meetLattice.top());
      } else {
        throw InternalException.make("Unsupported semilattice type");
      }

      const stmt = this.cu.ast.getStatement(bb.stmtID);
      if (stmt === undefined) {
        throw InternalException.make(
          `Cannot find statement #${bb.stmtID} defined within node #${bb.idx}`,
        );
      }
      const outState = this.transfer.transfer(inState, bb, stmt);

      if (!this.lattice.leq(outState, results.getState(bb.idx)!)) {
        results.setState(bb.idx, outState);
        // Push successors or predecessors based on the analysis kind
        worklist.push(
          ...(this.kind === "forward"
            ? getSuccessors(this.cfg, bb)
            : getPredecessors(this.cfg, bb)),
        );
      }
    }

    return results;
  }

  public solve(): SolverResults<State> {
    return this.findFixpoint();
  }

  private isJoinSemilattice(
    lattice: Semilattice<State>,
  ): lattice is JoinSemilattice<State> {
    return (lattice as JoinSemilattice<State>).join !== undefined;
  }

  private isMeetSemilattice(
    lattice: Semilattice<State>,
  ): lattice is MeetSemilattice<State> {
    return (lattice as MeetSemilattice<State>).meet !== undefined;
  }
}
