/**
 * Interface for a join semilattice that introduces the join operation.
 *
 * @template T The type of elements in the semilattice.
 */
export interface JoinSemilattice<T> extends Semilattice<T> {
  /**
   * Represents the bottom element of the lattice.
   * @returns The bottom element.
   */
  bottom(): T;

  /**
   * Joins two elements of the semilattice, returning the least upper bound (lub) of the two elements.
   * @param a First element to join.
   * @param b Second element to join.
   * @returns The joined value.
   */
  join(a: T, b: T): T;

  /**
   * Determines if one element in the semilattice is less than or equal to another element.
   * @param a The element to compare.
   * @param b The element to compare against.
   * @returns `true` if `a` is less than or equal to `b`, otherwise `false`.
   */
  leq(a: T, b: T): boolean;
}

/**
 * Interface for a meet semilattice that introduces the meet operation.
 * @template T The type of elements in the semilattice.
 */
export interface MeetSemilattice<T> extends Semilattice<T> {
  /**
   * Represents the top element of the lattice.
   * @returns The top element.
   */
  top(): T;

  /**
   * Meets two elements of the semilattice, returning the greatest lower bound (glb) of the two elements.
   * @param a First element to meet.
   * @param b Second element to meet.
   * @returns The met value.
   */
  meet(a: T, b: T): T;

  /**
   * Determines if one element in the semilattice is less than or equal to another element.
   * @param a The element to compare.
   * @param b The element to compare against.
   * @returns `true` if `a` is less than or equal to `b`, otherwise `false`.
   */
  leq(a: T, b: T): boolean;
}

export interface Semilattice<T> {
  /**
   * Determines if one element in the semilattice is less than or equal to another element.
   * @param a The element to compare.
   * @param b The element to compare against.
   * @returns `true` if `a` is less than or equal to `b`, otherwise `false`.
   */
  leq(a: T, b: T): boolean;
}

/**
 * Implementation of a join semilattice for sets.
 *
 * @template T The type of elements in the sets.
 */
export class SetJoinSemilattice<T> implements JoinSemilattice<Set<T>> {
  /**
   * Joins two sets by union.
   */
  join(a: Set<T>, b: Set<T>): Set<T> {
    return new Set([...a, ...b]);
  }

  /**
   * Returns the bottom element: empty set.
   */
  bottom(): Set<T> {
    return new Set();
  }

  /**
   * Subset relation: a ≤ b iff a ⊆ b
   */
  leq(a: Set<T>, b: Set<T>): boolean {
    return [...a].every((x) => b.has(x));
  }
}

/**
 * Implementation of a meet semilattice for sets.
 *
 * @template T The type of elements in the sets.
 */
export class SetMeetSemilattice<T> implements MeetSemilattice<Set<T>> {
  /**
   * Meets two sets by intersection.
   */
  meet(a: Set<T>, b: Set<T>): Set<T> {
    return new Set([...a].filter((x) => b.has(x)));
  }

  /**
   * Returns the top element: empty set.
   */
  top(): Set<T> {
    return new Set();
  }

  /**
   * Reverse subset relation: a ≤ b iff b ⊆ a
   */
  leq(a: Set<T>, b: Set<T>): boolean {
    return [...b].every((x) => a.has(x));
  }
}
