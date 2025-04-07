import { InternalException } from "./exceptions";
import { unreachable } from "./util";
import { SrcInfo } from "@tact-lang/compiler";

/**
 * Represents a position in a source file with line and column numbers.
 */
export type Position = {
  line: number;
  column: number;
};

/**
 * Creates a Position object from a SrcInfo location.
 *
 * @param loc - Source information containing interval data
 * @returns Position object with line and column numbers
 */
export function makeStartPos(loc: SrcInfo): Position {
  const lineAndColumn = loc.interval.getLineAndColumn();
  return {
    line: lineAndColumn.lineNum,
    column: lineAndColumn.colNum,
  };
}

/**
 * Creates an end Position object from a SrcInfo location.
 *
 * @param loc - Source information containing interval data
 * @returns Position object representing the end position
 */
export function makeEndPos(loc: SrcInfo): Position {
  const endLineAndColumn = loc.interval.contents
    .substring(0, loc.interval.endIdx)
    .split("\n");
  const lastLine = endLineAndColumn.length;
  const lastColumn = endLineAndColumn[endLineAndColumn.length - 1].length + 1;
  return {
    line: lastLine,
    column: lastColumn,
  };
}

/**
 * Represents a range in a source file with start and end positions.
 */
export type Range = {
  start: Position;
  end: Position;
};

/**
 * Creates a Range object from start and optional end SrcInfo.
 * If end is not provided, uses start for both positions.
 *
 * @param start - Source information for the start position
 * @param end - Optional source information for the end position
 * @returns Range object with start and end positions
 */
export function makeRange(start: SrcInfo, end?: SrcInfo): Range {
  return {
    start: makeStartPos(start),
    end: makeEndPos(end || start),
  };
}

/**
 * Represents a text replacement with range and replacement value.
 */
export type Replacement = { range: Range; value: string };

/**
 * Creates a Replacement object.
 *
 * @param range - Range of positions of the replacement
 * @param value - Text to replace the content between start and end
 * @returns A Replacement object
 */
export function makeReplacement(range: Range, value: string): Replacement {
  return { range, value };
}

/**
 * Represents a quick fix suggestion for code issues.
 *
 * Can be one of:
 * - replace: Replace text at multiple locations
 * - insert: Insert text at a specific location
 * - delete: Delete text between start and end positions
 */
export type QuickFix =
  | {
      kind: "replace";
      description: string;
      shown: boolean;
      replacements: Replacement[];
    }
  | {
      kind: "insert";
      description: string;
      shown: boolean;
      insertion: Replacement;
    }
  | { kind: "delete"; description: string; shown: boolean; range: Range };

/**
 * Creates a 'replace' QuickFix.
 *
 * @param description - Human-readable description of the quick fix
 * @param shown - Whether Misti should display this warning in CLI or it is just for the LSP.
 * @param replacements - Array of Replacement objects
 * @returns A QuickFix of kind 'replace'
 */
export function makeReplace(
  description: string,
  shown: boolean,
  ...replacements: Replacement[]
): QuickFix | never {
  if (replacements.length === 0) {
    throw InternalException.make("QuickFix: Replacements list cannot be empty");
  }
  return {
    kind: "replace",
    shown,
    description,
    replacements,
  };
}

/**
 * Creates an 'insert' QuickFix.
 *
 * @param description - Human-readable description of the quick fix
 * @param shown - Whether Misti should display this warning in CLI or it is just for the LSP.
 * @param insertion - Replacement object representing the insertion
 * @returns A QuickFix of kind 'insert'
 */
export function makeInsert(
  description: string,
  shown: boolean,
  insertion: Replacement,
): QuickFix {
  return {
    kind: "insert",
    shown,
    description,
    insertion,
  };
}

/**
 * Creates a 'delete' QuickFix.
 *
 * @param description - Human-readable description of the quick fix
 * @param shown - Whether Misti should display this warning in CLI or it is just for the LSP.
 * @param range - Range position of the text to delete
 * @returns A QuickFix of kind 'delete'
 */
export function makeDelete(
  description: string,
  shown: boolean,
  range: Range,
): QuickFix {
  return {
    kind: "delete",
    description,
    shown,
    range,
  };
}

/**
 * Returns a human-readable string representation of a QuickFix.
 *
 * @param qf - The QuickFix to convert to string
 * @returns A string representation of the QuickFix
 */
export function quickFixToString(qf: QuickFix): string {
  switch (qf.kind) {
    case "replace":
      return `Replace with: ${qf.replacements.map((r) => r.value).join(", ")}`;
    case "insert":
      return `Insert: ${qf.insertion.value}`;
    case "delete":
      return qf.description || `Delete selected code`;
    default:
      unreachable(qf);
  }
}
