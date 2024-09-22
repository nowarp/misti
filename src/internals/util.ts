/**
 * Additional generic TypeScript functions used in the project.
 *
 * @packageDocumentation
 */

/**
 * Intersection of two lists.
 */
export const intersection = <T>(l1: T[], l2: T[]): T[] =>
  l1.filter((element) => l2.includes(element));
