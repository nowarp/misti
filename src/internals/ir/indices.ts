/**
 * Generates unique indexes is used to assign unique identifiers to nodes and edges,
 * ensuring that each element within the CFG can be distinctly referenced.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IdxGenerator {
  let currentIdx = 0;
  export function next(): number {
    currentIdx += 1;
    return currentIdx;
  }

  /**
   * Resets the current index number. For internal use only.
   */
  export function __reset() {
    currentIdx = 0;
  }
}
