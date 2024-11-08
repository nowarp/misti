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

  static fromNum(i: bigint | number): Interval {
    const n = Num.int(i);
    return new Interval(n, n);
  }

  isFull(): boolean {
    return this.low.kind === "MInf" && this.high.kind === "PInf";
  }

  isEmpty(): boolean {
    return this.low.kind === "PInf" && this.high.kind === "MInf";
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

  div(other: Interval): Interval {
    if (other.containsZero()) {
      throw new Error("Division by interval containing zero");
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
    if (Num.compare(this.low, this.high) === 0n) return Num.toString(this.low);
    return `(${Num.toString(this.low)}, ${Num.toString(this.high)})`;
  }
}
