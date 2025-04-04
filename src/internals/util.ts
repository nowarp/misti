/**
 * Additional generic TypeScript functions used in the project.
 *
 * @packageDocumentation
 */

import { InternalException } from "./exceptions";
import path from "path";

export const mergeSets = <T>(lhs: Set<T>, rhs: Set<T>): Set<T> =>
  new Set([...lhs, ...rhs]);
export const isSetSubsetOf = <T>(
  lhs: Set<T>,
  rhs: Set<T>,
  eq: (a: T, b: T) => boolean = (a, b) => a === b,
): boolean =>
  [...lhs].every((elem) => [...rhs].some((rElem) => eq(elem, rElem)));
export const intersectSets = <T>(setA: Set<T>, setB: Set<T>): Set<T> =>
  new Set([...setA].filter((item) => setB.has(item)));

export const mergeLists = <T>(lhs: T[], rhs: T[]): T[] => [...lhs, ...rhs];
export const isListSubsetOf = <T>(
  lhs: T[],
  rhs: T[],
  eq: (a: T, b: T) => boolean = (a, b) => a === b,
): boolean => lhs.every((elem) => rhs.some((rElem) => eq(elem, rElem)));
export const intersectLists = <T>(l1: T[], l2: T[]): T[] =>
  l1.filter((element) => l2.includes(element));

export const mergeMaps = <K, V>(lhs: Map<K, V>, rhs: Map<K, V>): Map<K, V> =>
  new Map([...lhs, ...rhs]);
export const isMapSubsetOf = <K, V>(
  lhs: Map<K, V>,
  rhs: Map<K, V>,
  eq: (a: V, b: V) => boolean = (a, b) => a === b,
): boolean =>
  [...lhs].every(([key, value]) => rhs.has(key) && eq(value, rhs.get(key)!));
export const intersectMaps = <K, V>(
  mapA: Map<K, V>,
  mapB: Map<K, V>,
): Map<K, V> =>
  new Map(
    [...mapA].filter(
      ([key, value]) => mapB.has(key) && mapB.get(key) === value,
    ),
  );

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
/**
 * Determines if code is running in a browser environment.
 * @returns true if in browser, false otherwise
 */
export function isBrowser(): boolean {
  return (
    typeof document !== "undefined" &&
    document !== null &&
    document.createElement !== undefined
  );
}
