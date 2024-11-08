import { JoinSemilattice } from "./common";
import { Num, NumImpl, Interval } from "../numbers";
import { WideningLattice } from "./widening";

/**
 * Infinite-length join semilattice lattice representing interval of numbers
 * with abstract interpretation operations over intervals.
 */
export class IntervalJoinSemiLattice
  implements JoinSemilattice<Interval>, WideningLattice<Interval>
{
  static bottomValue: Interval = Interval.EMPTY;
  static topValue: Interval = Interval.FULL;

  bottom(): Interval {
    return IntervalJoinSemiLattice.bottomValue;
  }

  top(): Interval {
    return IntervalJoinSemiLattice.topValue;
  }

  /**
   * Joins two elements, returning the least upper bound (lub) of the two
   * intervals.
   */
  join(x: Interval, y: Interval): Interval {
    if (x.isFull() || y.isFull()) {
      return Interval.FULL;
    }
    if (x.isEmpty()) return y;
    if (y.isEmpty()) return x;

    return new Interval(Num.min(x.low, y.low), Num.max(x.high, y.high));
  }

  widen(a: Interval, b: Interval): Interval {
    if (this.eq(a, b)) {
      return IntervalJoinSemiLattice.bottomValue;
    }
    const lower = this.widenNum(a.low, b.low, true);
    const upper = this.widenNum(a.high, b.high, false);
    return new Interval(lower, upper);
  }

  /**
   * Checks if interval a is less than or equal to interval b.
   */
  leq(a: Interval, b: Interval): boolean {
    return Num.compare(a.low, b.low) <= 0 && Num.compare(a.high, b.high) <= 0;
  }

  /**
   * Checks if interval a equal to interval b.
   * Returns true if a's lower bound is greater than or equal to b's lower bound
   * and a's upper bound is less than or equal to b's upper bound.
   */
  eq(a: Interval, b: Interval): boolean {
    return Num.compare(a.low, b.low) == 0n && Num.compare(a.high, b.high) == 0n;
  }

  private widenNum(a: NumImpl, b: NumImpl, isLower: boolean): NumImpl {
    if (Num.compare(a, b) === 0n) {
      return a;
    }
    if (isLower) {
      return Num.compare(b, a) < 0 ? b : Num.m();
    } else {
      return Num.compare(b, a) > 0 ? b : Num.p();
    }
  }
}
