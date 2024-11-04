/**
 * Numbers that could include positive and negative infinitiy.
 *
 * We use these instead of `number` to distinguish infinities, since in Node.js
 * positive and negative infinities are numbers as well.
 *
 * @packageDocumentation
 */

export type Num = IntNum | PInf | MInf;

export interface IntNum {
  kind: "IntNum";
  value: number;
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

export function intNum(value: number): IntNum {
  return { kind: "IntNum", value };
}

export function pInf(): PInf {
  return { kind: "PInf" };
}

export function mInf(): MInf {
  return { kind: "MInf" };
}
