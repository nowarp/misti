/**
 * Interface for a lattice structure, providing methods for control flow analysis.
 * @template T The type of elements in the lattice.
 */
export interface Lattice<T> {
  /**
   * Represents the bottom element of the semilattice.
   */
  bottom(): T;

  /**
   * Determines if one element in the semilattice is less than or equal to another element.
   * This is crucial for determining if the analysis has reached a fixpoint.
   * @param a The element to be compared.
   * @param b The element to compare against.
   * @returns `true` if `a` is less than or equal to `b`, otherwise `false`.
   */
  leq(a: T, b: T): boolean;
}

/**
 * Interface for a join semilattice that introduces the join operation.
 * @template T The type of elements in the semilattice.
 */
export interface JoinSemilattice<T> extends Lattice<T> {
  /**
   * Joins two elements of the semilattice, returning the least upper bound (lub) of the two elements.
   * @param a First element to join.
   * @param b Second element to join.
   * @returns The joined value, representing the combination of `a` and `b`.
   */
  join(a: T, b: T): T;
}

/**
 * Interface for a meet semilattice that introduces the meet operation.
 * @template T The type of elements in the semilattice.
 */
export interface MeetSemilattice<T> extends Lattice<T> {
  /**
   * Meets two elements of the semilattice, returning the greatest lower bound (glb) of the two elements.
   * @param a First element to meet.
   * @param b Second element to meet.
   * @returns The met value, representing the combination of `a` and `b`.
   */
  meet(a: T, b: T): T;
}

/**
 * Implementation of a join semilattice for sets, providing methods to establish a partial order relation.
 * @template T The type of elements in the sets.
 */
export class SetJoinSemilattice<T> implements JoinSemilattice<Set<T>> {
  join(a: Set<T>, b: Set<T>): Set<T> {
    return new Set([...a, ...b]);
  }

  bottom(): Set<T> {
    return new Set();
  }

  leq(a: Set<T>, b: Set<T>): boolean {
    return [...a].every((x) => b.has(x));
  }
}

/**
 * Implementation of a meet semilattice for sets, providing methods to establish a partial order relation.
 * @template T The type of elements in the sets.
 */
export class SetMeetSemilattice<T> implements MeetSemilattice<Set<T>> {
  meet(a: Set<T>, b: Set<T>): Set<T> {
    return Array.from(a).reduce((acc, elem) => {
      if (b.has(elem)) {
        acc.add(elem);
      }
      return acc;
    }, new Set<T>());
  }

  bottom(): Set<T> {
    return new Set();
  }

  leq(a: Set<T>, b: Set<T>): boolean {
    return [...a].every((x) => b.has(x));
  }
}
