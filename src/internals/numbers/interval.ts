import { Num, NumImpl } from "./num";

/**
 * Represents a numeric interval [low, high] in abstract interpretation.
 * Supports basic arithmetic operations and comparisons on intervals.
 *
 * Special cases:
 * - FULL: (-∞, +∞) represents the interval containing all numbers
 * - EMPTY: Empty interval (∅) represents an invalid or undefined interval
 *
 * @remarks
 * This class implements interval arithmetic for abstract interpretation,
 * following standard interval arithmetic rules for operations like
 * addition, multiplication, division etc.
 *
 * @throws Error when performing division by an interval containing zero
 */
export class Interval {
  constructor(
    public readonly low: NumImpl,
    public readonly high: NumImpl,
  ) {}

  static FULL = new Interval(Num.m(), Num.p());
  static EMPTY = new Interval(Num.p(), Num.m());

  /**
   * Creates an interval `[a, a]`.
   */
  static fromNum(a: bigint | number): Interval {
    const n = Num.int(a);
    return new Interval(n, n);
  }

  /**
   * Creates an interval `[a, b]`.
   */
  static fromNums(a: bigint | number, b: bigint | number): Interval {
    const an = Num.int(a);
    const bn = Num.int(b);
    return new Interval(an, bn);
  }

  isFull(): boolean {
    return this.low.kind === "MInf" && this.high.kind === "PInf";
  }

  isEmpty(): boolean {
    return this.low.kind === "PInf" && this.high.kind === "MInf";
  }

  /**
   * Checks if this interval is less than or equal to other interval.
   */
  leq(other: Interval): boolean {
    if (this.isEmpty()) return true; // empty interval is less than everything
    if (other.isEmpty()) return false; // nothing is less than empty (except empty)
    if (other.isFull()) return true; // everything is less than full interval
    if (this.isFull()) return false; // full interval is not less than anything (except full)
    return (
      Num.compare(this.low, other.low) <= 0 &&
      Num.compare(this.high, other.high) <= 0
    );
  }

  eq(other: Interval): boolean {
    return (
      Num.compare(this.low, other.low) == 0n &&
      Num.compare(this.high, other.high) == 0n
    );
  }

  plus(other: Interval): Interval {
    return new Interval(
      Num.add(this.low, other.low),
      Num.add(this.high, other.high),
    );
  }

  inv(): Interval {
    return new Interval(Num.negate(this.high), Num.negate(this.low));
  }

  minus(other: Interval): Interval {
    return this.plus(other.inv());
  }

  times(other: Interval): Interval {
    const products = [
      Num.multiply(this.low, other.low),
      Num.multiply(this.low, other.high),
      Num.multiply(this.high, other.low),
      Num.multiply(this.high, other.high),
    ];
    return new Interval(Num.min(...products), Num.max(...products));
  }

  /**
   * Abstract division.
   *
   * @returns A division result or a full interval if attempting to divide by zero.
   */
  div(other: Interval): Interval {
    if (other.containsZero()) {
      return Interval.FULL;
    }
    const quotients = [
      Num.divide(this.low, other.low),
      Num.divide(this.low, other.high),
      Num.divide(this.high, other.low),
      Num.divide(this.high, other.high),
    ];
    return new Interval(Num.min(...quotients), Num.max(...quotients));
  }

  containsZero(): boolean {
    return (
      Num.compare(this.low, Num.int(0)) <= 0 &&
      Num.compare(this.high, Num.int(0)) >= 0
    );
  }

  equals(other: Interval): Interval {
    if (this.isFull() || other.isFull()) {
      return Interval.FULL;
    }
    if (
      this.low.kind === "IntNum" &&
      this.low === this.high &&
      other.low.kind === "IntNum" &&
      other.low === other.high &&
      this.low.value === other.low.value
    ) {
      return Interval.fromNum(1);
    }
    return new Interval(Num.int(0), Num.int(1));
  }

  toString(): string {
    if (this.isFull()) return "(-∞, +∞)";
    if (this.isEmpty()) return "∅";
    if (Num.compare(this.low, this.high) === 0n) return this.low.toString();
    return `(${this.low.toString()}, ${this.high.toString()})`;
  }

  clone(): Interval {
    return new Interval(this.low, this.high);
  }
}
