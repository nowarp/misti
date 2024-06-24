import { JoinSemilattice } from "./lattice";
import { CFG, Node, NodeIdx } from "./ir";

/**
 * Results of solving a generic dataflow problem.
 * @template State The type representing the state in the dataflow analysis.
 */
export class SolverResults<State> {
  private stateMap: Map<NodeIdx, State>;

  constructor() {
    this.stateMap = new Map();
  }

  public getState(idx: NodeIdx): State | undefined {
    return this.stateMap.get(idx);
  }

  public setState(idx: NodeIdx, state: State): void {
    this.stateMap.set(idx, state);
  }

  public getStates(): Map<NodeIdx, State> {
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
      results.setState(node.idx, this.lattice.bottom());
    });

    while (worklist.length > 0) {
      const node = worklist.pop()!;
      const inState = this.getPredecessors(node).reduce((acc, pred) => {
        return this.lattice.join(acc, results.getState(pred.idx)!);
      }, this.lattice.bottom());

      const outState = this.transfer(node, inState);

      if (!this.lattice.leq(outState, results.getState(node.idx)!)) {
        results.setState(node.idx, outState);
        worklist.push(...this.getPredecessors(node));
      }
    }

    return results;
  }
}
