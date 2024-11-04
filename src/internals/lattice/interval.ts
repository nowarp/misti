import { ExecutionException, InternalException } from "../exceptions";
import { Num, mInf, pInf, intNum, IntNum } from "./num";

export type Interval = [Num, Num];

/**
 * Infinite-length lattice representing interval of numbers.
 */
export class IntervalLattice {
  static FullInterval: Interval = [mInf(), pInf()];
  static EmptyInterval: Interval = [pInf(), mInf()];

  static bottom: Interval = IntervalLattice.EmptyInterval;
  static top: Interval = IntervalLattice.FullInterval;

  static int2num(i: number): IntNum {
    return intNum(i);
  }

  /**
   * Number as interval.
   */
  static num(i: number): Interval {
    const n = IntervalLattice.int2num(i);
    return [n, n];
  }

  /**
   * Compare two Nums.
   */
  static compareNum(a: Num, b: Num): number {
    if (a.kind === "IntNum" && b.kind === "IntNum") {
      return a.value - b.value;
    } else if (a.kind === b.kind) {
      return 0;
    } else if (a.kind === "MInf" || b.kind === "PInf") {
      return -1;
    } else {
      return 1;
    }
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
    const lower = IntervalLattice.minNum(x[0], y[0]);
    const upper = IntervalLattice.maxNum(x[1], y[1]);
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
   * Adds two Nums.
   */
  static addNums(a: Num, b: Num): Num {
    if (a.kind === "IntNum" && b.kind === "IntNum") {
      return intNum(a.value + b.value);
    }
    if (
      (a.kind === "PInf" && b.kind === "MInf") ||
      (a.kind === "MInf" && b.kind === "PInf")
    ) {
      throw ExecutionException.make("Cannot add +inf and -inf");
    }
    if (a.kind === "PInf" || b.kind === "PInf") {
      return pInf();
    }
    if (a.kind === "MInf" || b.kind === "MInf") {
      return mInf();
    }
    throw InternalException.make("Invalid Num types for addition");
  }

  /**
   * Abstract binary `+` on intervals.
   */
  static plus(a: Interval, b: Interval): Interval {
    const low = IntervalLattice.addNums(a[0], b[0]);
    const high = IntervalLattice.addNums(a[1], b[1]);
    return [low, high];
  }

  /**
   * Negate a Num.
   */
  static negateNum(n: Num): Num {
    if (n.kind === "IntNum") {
      return intNum(-n.value);
    } else if (n.kind === "PInf") {
      return mInf();
    } else if (n.kind === "MInf") {
      return pInf();
    } else {
      throw new Error("Invalid Num type for negation");
    }
  }

  /**
   * Abstract unary `-` (negation) on intervals.
   */
  static inv(a: Interval): Interval {
    const low = IntervalLattice.negateNum(a[1]);
    const high = IntervalLattice.negateNum(a[0]);
    return [low, high];
  }

  /**
   * Abstract binary `-` on intervals.
   */
  static minus(a: Interval, b: Interval): Interval {
    return IntervalLattice.plus(a, IntervalLattice.inv(b));
  }

  /**
   * Multiply two Nums.
   */
  static multiplyNums(a: Num, b: Num): Num {
    // Handle cases involving infinities
    if (a.kind === "IntNum" && b.kind === "IntNum") {
      return intNum(a.value * b.value);
    }
    if (IntervalLattice.isZeroNum(a) || IntervalLattice.isZeroNum(b)) {
      return intNum(0);
    }
    if (
      (a.kind === "PInf" || a.kind === "MInf") &&
      (b.kind === "PInf" || b.kind === "MInf")
    ) {
      if (a.kind === b.kind) {
        return pInf();
      } else {
        return mInf();
      }
    }
    if (a.kind === "IntNum") {
      if (
        (a.value > 0 && b.kind === "PInf") ||
        (a.value < 0 && b.kind === "MInf")
      ) {
        return pInf();
      }
      if (
        (a.value > 0 && b.kind === "MInf") ||
        (a.value < 0 && b.kind === "PInf")
      ) {
        return mInf();
      }
      if (a.value === 0) {
        return intNum(0);
      }
    }
    if (b.kind === "IntNum") {
      return IntervalLattice.multiplyNums(b, a);
    }
    throw new Error("Invalid Num types for multiplication");
  }

  /**
   * Abstract binary `*` on intervals.
   */
  static times(a: Interval, b: Interval): Interval {
    const products = [
      IntervalLattice.multiplyNums(a[0], b[0]),
      IntervalLattice.multiplyNums(a[0], b[1]),
      IntervalLattice.multiplyNums(a[1], b[0]),
      IntervalLattice.multiplyNums(a[1], b[1]),
    ];
    const low = IntervalLattice.minNum(...products);
    const high = IntervalLattice.maxNum(...products);
    return [low, high];
  }

  /**
   * Checks if a Num is zero.
   */
  static isZeroNum(n: Num): boolean {
    return n.kind === "IntNum" && n.value === 0;
  }

  /**
   * Divide two Nums.
   */
  static divideNums(a: Num, b: Num): Num {
    // Handle division by zero
    if (IntervalLattice.isZeroNum(b)) {
      throw ExecutionException.make("Division by zero");
    }
    if (a.kind === "IntNum" && b.kind === "IntNum") {
      return intNum(a.value / b.value);
    }
    // Handle division involving infinities
    if (a.kind === "IntNum") {
      if (b.kind === "PInf" || b.kind === "MInf") {
        return intNum(0);
      }
    }
    if (b.kind === "IntNum") {
      if (b.value > 0) {
        if (a.kind === "PInf" || a.kind === "MInf") {
          return a;
        }
      } else if (b.value < 0) {
        if (a.kind === "PInf") {
          return mInf();
        }
        if (a.kind === "MInf") {
          return pInf();
        }
      }
    }
    if (a.kind === b.kind) {
      return intNum(1);
    }
    if (
      (a.kind === "PInf" && b.kind === "MInf") ||
      (a.kind === "MInf" && b.kind === "PInf")
    ) {
      return intNum(-1);
    }
    throw InternalException.make("Invalid Num types for division");
  }

  /**
   * Abstract `/` on intervals.
   */
  static div(a: Interval, b: Interval): Interval {
    // Handle division by intervals containing zero
    if (IntervalLattice.containsZero(b)) {
      throw new Error("Division by interval containing zero");
    }
    const quotients = [
      IntervalLattice.divideNums(a[0], b[0]),
      IntervalLattice.divideNums(a[0], b[1]),
      IntervalLattice.divideNums(a[1], b[0]),
      IntervalLattice.divideNums(a[1], b[1]),
    ];
    const low = IntervalLattice.minNum(...quotients);
    const high = IntervalLattice.maxNum(...quotients);
    return [low, high];
  }

  /**
   * Checks if an interval contains zero.
   */
  static containsZero(interval: Interval): boolean {
    const [low, high] = interval;
    const lowCompare = IntervalLattice.compareNum(low, intNum(0));
    const highCompare = IntervalLattice.compareNum(high, intNum(0));
    return lowCompare <= 0 && highCompare >= 0;
  }

  /**
   * Abstract `==` on intervals.
   */
  static eqq(a: Interval, b: Interval): Interval {
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
    return [intNum(0), intNum(1)];
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
    if (IntervalLattice.compareNum(a[1], b[0]) < 0) {
      return IntervalLattice.num(1);
    }
    if (IntervalLattice.compareNum(a[0], b[1]) > 0) {
      return IntervalLattice.num(0);
    }
    return [intNum(0), intNum(1)];
  }

  /**
   * Finds the minimum of given Num values.
   */
  static minNum(...nums: Num[]): Num {
    return nums.reduce((a, b) =>
      IntervalLattice.compareNum(a, b) <= 0 ? a : b,
    );
  }

  /**
   * Finds the maximum of given Num values.
   */
  static maxNum(...nums: Num[]): Num {
    return nums.reduce((a, b) =>
      IntervalLattice.compareNum(a, b) >= 0 ? a : b,
    );
  }

  /**
   * Helper method to display Num as string
   */
  static numToString(n: Num): string {
    if (n.kind === "IntNum") {
      return n.value.toString();
    } else if (n.kind === "PInf") {
      return "+inf";
    } else if (n.kind === "MInf") {
      return "-inf";
    } else {
      return "unknown";
    }
  }

  static widen(a: Interval, b: Interval): Interval {
    const lower = IntervalLattice.widenNum(a[0], b[0], true);
    const upper = IntervalLattice.widenNum(a[1], b[1], false);
    return [lower, upper];
  }

  static widenNum(a: Num, b: Num, isLower: boolean): Num {
    if (IntervalLattice.compareNum(a, b) === 0) {
      return a;
    }
    if (isLower) {
      // If the new lower bound is less than the old, keep it; otherwise, set to -∞
      return IntervalLattice.compareNum(b, a) < 0 ? b : mInf();
    } else {
      // If the new upper bound is greater than the old, keep it; otherwise, set to +∞
      return IntervalLattice.compareNum(b, a) > 0 ? b : pInf();
    }
  }
}
