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
import {
  Semilattice,
  JoinSemilattice,
  MeetSemilattice,
  WideningLattice,
} from "../lattice";
import { Num } from "../numbers/";
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
export abstract class AbstractWorklistSolver<State> implements Solver<State> {
  protected readonly cu: CompilationUnit;
  protected readonly cfg: CFG;
  protected transfer: Transfer<State>;
  protected readonly lattice: Semilattice<State>;
  protected readonly kind: AnalysisKind;

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
   * Abstract method to update the state of a node.
   *
   * @param oldState The previous state of the node.
   * @param newState The newly computed state of the node.
   * @param iterations The number of times the node has been processed.
   * @returns The updated state after applying join/meet/widening/narrowing.
   */
  protected abstract updateState(
    oldState: State,
    newState: State,
    iterations: number,
  ): State;

  /**
   * Finds a fixpoint using the worklist algorithm.
   * @returns The results of solving the dataflow problem.
   */
  public findFixpoint(): SolverResults<State> {
    // Track results and how many times we've visited each node
    const results = new SolverResults<State>();
    const iterationCounts: Map<number, number> = new Map();

    // Initialize each block with lattice extremal value (⊥ for join, ⊤ for meet)
    const worklist: BasicBlock[] = [...this.cfg.nodes];
    worklist.forEach((bb) => {
      if (this.isJoinSemilattice(this.lattice)) {
        results.setState(bb.idx, this.lattice.bottom());
      } else if (this.isMeetSemilattice(this.lattice)) {
        results.setState(bb.idx, this.lattice.top());
      } else {
        throw InternalException.make("Unsupported semilattice type");
      }
      iterationCounts.set(bb.idx, 0);
    });

    while (worklist.length > 0) {
      const bb = worklist.shift()!;

      // Compute input state by combining states from predecessors/successors
      // depending on analysis direction (forward/backward)
      let inState: State;
      const neighborStates = (
        this.kind === "forward"
          ? getPredecessors(this.cfg, bb)
          : getSuccessors(this.cfg, bb)
      ).map((neighbor) => results.getState(neighbor.idx)!);

      // Apply lattice operation (join/meet) to combine neighbor states
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

      // Fetch and validate the AST statement for this basic block
      const stmt = this.cu.ast.getStatement(bb.stmtID);
      if (stmt === undefined) {
        throw InternalException.make(
          `Cannot find statement #${bb.stmtID} defined within node #${bb.idx}`,
        );
      }

      // Apply transfer function and get previous state for comparison
      let currentOut = this.transfer.transfer(inState, bb, stmt);
      const previousOut = results.getState(bb.idx)!;

      // Track visits to handle widening/narrowing in derived classes
      const iterations = iterationCounts.get(bb.idx)! + 1;
      iterationCounts.set(bb.idx, iterations);

      // Let derived solver classes apply their state update strategy
      currentOut = this.updateState(previousOut, currentOut, iterations);

      // If state changed (not less than or equal), update and propagate
      if (!this.lattice.leq(currentOut, previousOut)) {
        results.setState(bb.idx, currentOut);
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

  protected isJoinSemilattice(
    lattice: Semilattice<State>,
  ): lattice is JoinSemilattice<State> {
    return "join" in lattice && typeof lattice.join === "function";
  }

  protected isMeetSemilattice(
    lattice: Semilattice<State>,
  ): lattice is MeetSemilattice<State> {
    return "meet" in lattice && typeof lattice.meet === "function";
  }
}

/**
 * WorklistSolver performs a standard worklist-based iterative analysis relying
 * solely on the lattice's join or meet operation to update states.
 *
 * @template State The type representing the state in the analysis.
 */
export class WorklistSolver<State> extends AbstractWorklistSolver<State> {
  protected updateState(
    _oldState: State,
    newState: State,
    _iterations: number,
  ): State {
    return newState;
  }
}

/**
 * WideningWorklistSolver performs a worklist-based iterative analysis using
 * widening to accelerate convergence when a specified iteration threshold is
 * reached.
 *
 * @template State The type representing the state in the analysis.
 */
export class WideningWorklistSolver<
  State,
> extends AbstractWorklistSolver<State> {
  private readonly maxIterations: number;

  /**
   * @param maxIterations Number of iterations after which widening is applied.
   */
  constructor(
    cu: CompilationUnit,
    cfg: CFG,
    transfer: Transfer<State>,
    lattice: WideningLattice<State>,
    kind: AnalysisKind,
    maxIterations: number = 5,
  ) {
    super(cu, cfg, transfer, lattice, kind);
    this.maxIterations = maxIterations;
  }

  protected updateState(
    oldState: State,
    newState: State,
    iterations: number,
  ): State {
    if (iterations >= this.maxIterations) {
      // Apply widening
      return (this.lattice as WideningLattice<State>).widen(oldState, newState);
    } else {
      // Use standard join or meet
      if (this.isJoinSemilattice(this.lattice)) {
        const joinLattice = this.lattice as JoinSemilattice<State>;
        return joinLattice.join(oldState, newState);
      } else if (this.isMeetSemilattice(this.lattice)) {
        const meetLattice = this.lattice as MeetSemilattice<State>;
        return meetLattice.meet(oldState, newState);
      } else {
        throw InternalException.make("Unsupported semilattice type");
      }
    }
  }

  /**
   * Type guard to check if the value is a numeric type.
   * @param n The value to check.
   * @returns True if the value is a Num, false otherwise.
   */
  private isNum(n: any): n is Num {
    return (
      typeof n === "object" &&
      "kind" in n &&
      (n.kind === "IntNum" || n.kind === "PInf" || n.kind === "MInf")
    );
  }
}
