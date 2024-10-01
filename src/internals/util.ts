/**
 * Additional generic TypeScript functions used in the project.
 *
 * @packageDocumentation
 */

import { InternalException } from "./exceptions";

/**
 * Intersection of two lists.
 */
export const intersection = <T>(l1: T[], l2: T[]): T[] =>
  l1.filter((element) => l2.includes(element));

/**
 * Unreachable case for exhaustive checking.
 */
export function unreachable(value: never): never {
  throw InternalException.make(`Reached impossible case`, { node: value });
}
