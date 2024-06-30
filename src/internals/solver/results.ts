import { NodeIdx } from "../ir";

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
