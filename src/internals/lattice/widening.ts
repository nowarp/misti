import { Semilattice } from "./common";

export interface WideningLattice<T> extends Semilattice<T> {
  /**
   * Applies the widening operation to accelerate convergence.
   * @param oldState The previous state.
   * @param newState The newly computed state.
   * @returns The widened state.
   */
  widen(oldState: T, newState: T): T;
}
