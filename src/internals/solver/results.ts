import { BasicBlockIdx } from "../ir";

/**
 * Results of solving a generic dataflow problem.
 * @template State The type representing the state in the dataflow analysis.
 */
export class SolverResults<State> {
  private stateMap: Map<BasicBlockIdx, State>;

  constructor() {
    this.stateMap = new Map();
  }

  public getState(idx: BasicBlockIdx): State | undefined {
    return this.stateMap.get(idx);
  }

  public setState(idx: BasicBlockIdx, state: State): void {
    this.stateMap.set(idx, state);
  }

  public getStates(): Map<BasicBlockIdx, State> {
    return this.stateMap;
  }
}
