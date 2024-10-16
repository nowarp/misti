/**
 * Additional generic TypeScript functions used in the project.
 *
 * @packageDocumentation
 */

import { InternalException } from "./exceptions";
import path from "path";

/**
 * Intersection of two lists.
 */
export const intersection = <T>(l1: T[], l2: T[]): T[] =>
  l1.filter((element) => l2.includes(element));

export const mergeSets = <T>(lhs: Set<T>, rhs: Set<T>): Set<T> =>
  new Set([...lhs, ...rhs]);
export const isSubsetOf = <T>(lhs: Set<T>, rhs: Set<T>): boolean =>
  [...lhs].every((elem) => rhs.has(elem));

export const mergeLists = <T>(lhs: T[], rhs: T[]): T[] => [...lhs, ...rhs];
export const isListSubsetOf = <T>(lhs: T[], rhs: T[]): boolean =>
  lhs.every((elem) => rhs.includes(elem));

export const mergeMaps = <K, V>(lhs: Map<K, V>, rhs: Map<K, V>): Map<K, V> =>
  new Map([...lhs, ...rhs]);
export const isMapSubsetOf = <K, V>(lhs: Map<K, V>, rhs: Map<K, V>): boolean =>
  [...lhs].every(([key, value]) => rhs.has(key) && rhs.get(key) === value);

/**
 * Unreachable case for exhaustive checking.
 */
export function unreachable(value: never): never {
  throw InternalException.make(`Reached impossible case`, { node: value });
}

/**
 * Checks if there are subdirectories present in the absolute path.
 */
export function hasSubdirs(filePath: string, subdirs: string[]): boolean {
  const splitPath = filePath.split(path.sep);
  return subdirs.every((dir) => splitPath.includes(dir));
}
