import { SolverResults } from "./results";

/**
 * A generic interface that defines dataflow-equations solvers.
 */
export interface Solver<State> {
  solve(): SolverResults<State>;
}
