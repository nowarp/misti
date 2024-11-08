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

  /**
   * Implements the widening operator (∇) for intervals to ensure termination
   * of fixed point computations.
   *
   * @param a First interval operand
   * @param b Second interval operand (typically the newer value)
   * @returns Widened interval that over-approximates both inputs
   */
  widen(a: Interval, b: Interval): Interval {
    if (a.isEmpty()) return b;
    if (b.isEmpty()) return a;
    if (a.isFull() || b.isFull()) return Interval.FULL;
    const lower = this.widenNum(a.low, b.low, true);
    const upper = this.widenNum(a.high, b.high, false);
    return new Interval(lower, upper);
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

  leq(x: Interval, y: Interval): boolean {
    return x.leq(y);
  }
}
