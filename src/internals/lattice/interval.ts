import { Num, NumImpl } from "./num";

export type Interval = [NumImpl, NumImpl];

/**
 * Infinite-length lattice representing interval of numbers.
 */
export class IntervalLattice {
  static FullInterval: Interval = [Num.m(), Num.p()];
  static EmptyInterval: Interval = [Num.p(), Num.m()];

  static bottom: Interval = IntervalLattice.EmptyInterval;
  static top: Interval = IntervalLattice.FullInterval;

  /**
   * Number as interval.
   */
  static num(i: number): Interval {
    const n = Num.int(i);
    return [n, n];
  }

  /**
   * Least upper bound (lub) of two intervals.
   */
  static lub(x: Interval, y: Interval): Interval {
    if (
      IntervalLattice.isFullInterval(x) ||
      IntervalLattice.isFullInterval(y)
    ) {
      return IntervalLattice.FullInterval;
    }
    if (IntervalLattice.isEmptyInterval(x)) {
      return y;
    }
    if (IntervalLattice.isEmptyInterval(y)) {
      return x;
    }
    const lower = Num.min(x[0], y[0]);
    const upper = Num.max(x[1], y[1]);
    return [lower, upper];
  }

  /**
   * Checks if the interval is the full interval (-inf, +inf).
   */
  static isFullInterval(interval: Interval): boolean {
    return interval[0].kind === "MInf" && interval[1].kind === "PInf";
  }

  /**
   * Checks if the interval is the empty interval (inf, -inf).
   */
  static isEmptyInterval(interval: Interval): boolean {
    return interval[0].kind === "PInf" && interval[1].kind === "MInf";
  }

  /**
   * Abstract binary `+` on intervals.
   */
  static plus(a: Interval, b: Interval): Interval {
    const low = Num.add(a[0], b[0]);
    const high = Num.add(a[1], b[1]);
    return [low, high];
  }

  /**
   * Abstract unary `-` (negation) on intervals.
   */
  static inv(a: Interval): Interval {
    const low = Num.negate(a[1]);
    const high = Num.negate(a[0]);
    return [low, high];
  }

  /**
   * Abstract binary `-` on intervals.
   */
  static minus(a: Interval, b: Interval): Interval {
    return IntervalLattice.plus(a, IntervalLattice.inv(b));
  }

  /**
   * Abstract binary `*` on intervals.
   */
  static times(a: Interval, b: Interval): Interval {
    const products = [
      Num.multiply(a[0], b[0]),
      Num.multiply(a[0], b[1]),
      Num.multiply(a[1], b[0]),
      Num.multiply(a[1], b[1]),
    ];
    const low = Num.min(...products);
    const high = Num.max(...products);
    return [low, high];
  }

  /**
   * Abstract `/` on intervals.
   */
  static div(a: Interval, b: Interval): Interval {
    if (IntervalLattice.containsZero(b)) {
      throw new Error("Division by interval containing zero");
    }
    const quotients = [
      Num.divide(a[0], b[0]),
      Num.divide(a[0], b[1]),
      Num.divide(a[1], b[0]),
      Num.divide(a[1], b[1]),
    ];
    const low = Num.min(...quotients);
    const high = Num.max(...quotients);
    return [low, high];
  }

  /**
   * Checks if an interval contains zero.
   */
  static containsZero(interval: Interval): boolean {
    const [low, high] = interval;
    const lowCompare = Num.compare(low, Num.int(0));
    const highCompare = Num.compare(high, Num.int(0));
    return lowCompare <= 0 && highCompare >= 0;
  }

  /**
   * Abstract `==` on intervals.
   */
  static eq(a: Interval, b: Interval): Interval {
    if (
      IntervalLattice.isFullInterval(a) ||
      IntervalLattice.isFullInterval(b)
    ) {
      return IntervalLattice.FullInterval;
    }
    if (
      a[0].kind === "IntNum" &&
      a[0] === a[1] &&
      b[0].kind === "IntNum" &&
      b[0] === b[1] &&
      a[0].value === b[0].value
    ) {
      return IntervalLattice.num(1);
    }
    return [Num.int(0), Num.int(1)];
  }

  /**
   * Abstract `>` on intervals.
   */
  static gt(a: Interval, b: Interval): Interval {
    if (
      IntervalLattice.isFullInterval(a) ||
      IntervalLattice.isFullInterval(b)
    ) {
      return IntervalLattice.FullInterval;
    }
    if (Num.compare(a[1], b[0]) < 0) {
      return IntervalLattice.num(1);
    }
    if (Num.compare(a[0], b[1]) > 0) {
      return IntervalLattice.num(0);
    }
    return [Num.int(0), Num.int(1)];
  }

  static widen(a: Interval, b: Interval): Interval {
    const lower = IntervalLattice.widenNum(a[0], b[0], true);
    const upper = IntervalLattice.widenNum(a[1], b[1], false);
    return [lower, upper];
  }

  static widenNum(a: NumImpl, b: NumImpl, isLower: boolean): NumImpl {
    if (Num.compare(a, b) === 0) {
      return a;
    }
    if (isLower) {
      // If the new lower bound is less than the old, keep it; otherwise, set to -∞
      return Num.compare(b, a) < 0 ? b : Num.m();
    } else {
      // If the new upper bound is greater than the old, keep it; otherwise, set to +∞
      return Num.compare(b, a) > 0 ? b : Num.p();
    }
  }
}
