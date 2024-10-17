/**
 * Generates unique indexes used to assign unique identifiers to nodes and edges,
 * ensuring that each element within the CFG can be distinctly referenced.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IdxGenerator {
  // Change to a Map with string keys and number values
  const currentIdxMap = new Map<string, number>();

  // Update next function to accept a string key
  export function next(key: string): number {
    const currentValue = currentIdxMap.get(key) || 0;
    const nextValue = currentValue + 1;
    currentIdxMap.set(key, nextValue);
    return nextValue;
  }

  /**
   * Resets the current index map. For internal use only.
   */
  export function __reset() {
    currentIdxMap.clear();
  }
}
