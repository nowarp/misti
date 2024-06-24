import { JoinSemilattice } from "./lattice";
import { CFG, Node } from "./ir";

/**
 * Results of solving a generic dataflow problem.
 * @template State The type representing the state in the dataflow analysis.
 */
export class SolverResults<State> {
  private stateMap: Map<Node, State>;

  constructor() {
    this.stateMap = new Map();
  }

  public getState(node: Node): State | undefined {
    return this.stateMap.get(node);
  }

  public setState(node: Node, state: State): void {
    this.stateMap.set(node, state);
  }

  public getStates(): Map<Node, State> {
    return this.stateMap;
  }
}

/**
 * Solver for generic dataflow problems.
 */
export class Solver<State> {
  private cfg: CFG;
  private transfer: (node: Node, state: State) => State;
  private lattice: JoinSemilattice<State>;

  /**
   * @param transfer A function that defines the transfer operation for a node and its state.
   * @param lattice An instance of a lattice that defines the join, bottom, and leq operations.
   */
  constructor(
    cfg: CFG,
    transfer: (node: Node, state: State) => State,
    lattice: JoinSemilattice<State>,
  ) {
    this.cfg = cfg;
    this.transfer = transfer;
    this.lattice = lattice;
  }

  private getPredecessors(node: Node): Node[] {
    const predecessors = this.cfg.getPredecessors(node.idx);
    if (predecessors === undefined) {
      throw new Error(
        `Incorrect definition in the CFG: Node #${node.idx} has an undefined predecessor`,
      );
      // return [];
    }
    return predecessors;
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
      results.setState(node, this.lattice.bottom());
    });

    while (worklist.length > 0) {
      const node = worklist.pop()!;
      const inState = this.getPredecessors(node).reduce((acc, pred) => {
        return this.lattice.join(acc, results.getState(pred)!);
      }, this.lattice.bottom());

      const outState = this.transfer(node, inState);

      if (!this.lattice.leq(outState, results.getState(node)!)) {
        results.setState(node, outState);
        worklist.push(...this.getPredecessors(node));
      }
    }

    return results;
  }
}
