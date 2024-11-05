/**
 * Numbers that could include positive and negative infinitiy.
 *
 * We use these instead of `bigint` to distinguish infinities.
 * positive and negative infinities.
 *
 * @packageDocumentation
 */

import { ExecutionException, InternalException } from "../exceptions";

export type NumImpl = IntNum | PInf | MInf;

export interface IntNum {
  kind: "IntNum";
  value: bigint;
}

/**
 * Positive infinitiy.
 */
export interface PInf {
  kind: "PInf";
}

/**
 * Negative infinitiy.
 */
export interface MInf {
  kind: "MInf";
}

/**
 * Utility class for working with extended number types that include infinities.
 */
export class Num {
  /**
   * Creates an integer number representation.
   * @param value The numeric value to wrap
   * @returns An IntNum object
   */
  static int(value: bigint | number): IntNum {
    const bigIntValue = typeof value === "number" ? BigInt(value) : value;
    return { kind: "IntNum", value: bigIntValue };
  }

  /**
   * Creates a positive infinity representation.
   * @returns A PInf object
   */
  static p(): PInf {
    return { kind: "PInf" };
  }

  /**
   * Creates a negative infinity representation.
   * @returns An MInf object
   */
  static m(): MInf {
    return { kind: "MInf" };
  }

  /**
   * Adds two numbers, handling infinite values appropriately.
   * @throws {ExecutionException} When attempting to add +inf and -inf
   * @throws {InternalException} When given invalid NumImpl types
   */
  static add(a: NumImpl, b: NumImpl): NumImpl {
    if (a.kind === "IntNum" && b.kind === "IntNum") {
      return this.int(a.value + b.value);
    }
    if (
      (a.kind === "PInf" && b.kind === "MInf") ||
      (a.kind === "MInf" && b.kind === "PInf")
    ) {
      throw ExecutionException.make("Cannot add +inf and -inf");
    }
    if (a.kind === "PInf" || b.kind === "PInf") {
      return this.p();
    }
    if (a.kind === "MInf" || b.kind === "MInf") {
      return this.m();
    }
    throw InternalException.make("Invalid NumImpl types for addition");
  }

  /**
   * Compares two numbers, returning:
   * - negative if a < b
   * - zero if a = b
   * - positive if a > b
   */
  static compare(a: NumImpl, b: NumImpl): bigint {
    if (a.kind === "IntNum" && b.kind === "IntNum") {
      return a.value - b.value;
    } else if (a.kind === b.kind) {
      return 0n;
    } else if (a.kind === "MInf" || b.kind === "PInf") {
      return -1n;
    } else {
      return 1n;
    }
  }

  /**
   * Returns the arithmetic negation of a number.
   * @throws {Error} When given an invalid NumImpl type
   */
  static negate(n: NumImpl): NumImpl {
    if (n.kind === "IntNum") {
      return this.int(-n.value);
    } else if (n.kind === "PInf") {
      return this.m();
    } else if (n.kind === "MInf") {
      return this.p();
    } else {
      throw new Error("Invalid NumImpl type for negation");
    }
  }

  static isZero(n: NumImpl): boolean {
    return n.kind === "IntNum" && n.value === 0n;
  }

  static divide(a: NumImpl, b: NumImpl): NumImpl {
    if (this.isZero(b)) {
      throw ExecutionException.make("Division by zero");
    }
    if (a.kind === "IntNum" && b.kind === "IntNum") {
      return this.int(a.value / b.value);
    }
    if (a.kind === "IntNum") {
      if (b.kind === "PInf" || b.kind === "MInf") {
        return this.int(0n);
      }
    }
    if (b.kind === "IntNum") {
      if (b.value > 0) {
        if (a.kind === "PInf" || a.kind === "MInf") {
          return a;
        }
      } else if (b.value < 0) {
        if (a.kind === "PInf") {
          return this.m();
        }
        if (a.kind === "MInf") {
          return this.p();
        }
      }
    }
    if (a.kind === b.kind) {
      return this.int(1n);
    }
    if (
      (a.kind === "PInf" && b.kind === "MInf") ||
      (a.kind === "MInf" && b.kind === "PInf")
    ) {
      return this.int(-1n);
    }
    throw InternalException.make("Invalid NumImpl types for division");
  }

  static multiply(a: NumImpl, b: NumImpl): NumImpl {
    if (a.kind === "IntNum" && b.kind === "IntNum") {
      return this.int(a.value * b.value);
    }
    if (this.isZero(a) || this.isZero(b)) {
      return this.int(0n);
    }
    if (
      (a.kind === "PInf" || a.kind === "MInf") &&
      (b.kind === "PInf" || b.kind === "MInf")
    ) {
      if (a.kind === b.kind) {
        return this.p();
      } else {
        return this.m();
      }
    }
    if (a.kind === "IntNum") {
      if (
        (a.value > 0 && b.kind === "PInf") ||
        (a.value < 0 && b.kind === "MInf")
      ) {
        return this.p();
      }
      if (
        (a.value > 0 && b.kind === "MInf") ||
        (a.value < 0 && b.kind === "PInf")
      ) {
        return this.m();
      }
      if (a.value === 0n) {
        return this.int(0n);
      }
    }
    if (b.kind === "IntNum") {
      return this.multiply(b, a);
    }
    throw new Error("Invalid NumImpl types for multiplication");
  }

  /**
   * Returns the minimum of the given numbers.
   * @param nums Array of numbers to compare
   */
  static min(...nums: NumImpl[]): NumImpl {
    return nums.reduce((a, b) => (this.compare(a, b) <= 0 ? a : b));
  }

  /**
   * Returns the maximum of the given numbers.
   * @param nums Array of numbers to compare
   */
  static max(...nums: NumImpl[]): NumImpl {
    return nums.reduce((a, b) => (this.compare(a, b) >= 0 ? a : b));
  }

  static toString(n: NumImpl): string {
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
}
