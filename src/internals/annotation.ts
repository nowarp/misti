/**
 * Represents annotations in the comments processed by Misti.
 *
 * @packageDocumentation
 */

/**
 * Represents a Misti annotation.
 */
export type MistiAnnotation = {
  kind: "suppress";
  detectors: string[];
};

/**
 * The marker used to identify Misti suppress annotations.
 * Syntax: // @misti:suppress Detector1,Detector2
 */
export const SUPPRESS_MARKER = "@misti:suppress";

/**
 * Retrieves the Misti annotation from the current source location if present.
 *
 * These can be single or multi-line comments on the current or previous line
 * annotated with SUPPRESS_MARKER.
 *
 * @param code Code present in `SrcInfo.interval.getLineAndColumnMessage()`.
 */
export function getMistiAnnotation(code: string): MistiAnnotation | null {
  const lines = code.split("\n");
  const currentLineIndex = lines.findIndex((line) =>
    line.trim().startsWith(">"),
  );
  if (currentLineIndex <= 0) return null;
  const previousLine = lines[currentLineIndex - 1];
  const previousLineCode = getCodeFromLine(previousLine);
  const annotationPattern = new RegExp(
    `^\\s*(\\/\\/|\\/\\*)\\s*${SUPPRESS_MARKER}\\s+([\\w,]+)\\s*`,
  );

  const match = previousLineCode.match(annotationPattern);
  if (match) {
    const detectors = match[2].split(",").map((detector) => detector.trim());
    return {
      kind: "suppress",
      detectors,
    };
  }

  return null;
}

function getCodeFromLine(line: string): string {
  const pipeIndex = line.indexOf("|");
  if (pipeIndex !== -1) {
    return line.substring(pipeIndex + 1).trim();
  } else {
    return line.trim();
  }
}
