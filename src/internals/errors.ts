import { SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";
import { MistiContext } from "./context";
import * as path from "path";

/**
 * Enumerates the levels of severity that can be assigned to detected findings.
 */
export enum Severity {
  INFO,
  LOW,
  MEDIUM,
  HIGH,
  CRITICAL,
}

/**
 * Error instance that refers to a specific place in a Tact contract.
 */
export class MistiTactError extends Error {
  readonly loc: SrcInfo;
  constructor(
    msg: string,
    loc: SrcInfo,
    private _severity: Severity,
  ) {
    super(msg);
    this.loc = loc;
  }

  /**
   * Gets the severity level of this error.
   * @returns The severity as defined by the Severity enum.
   */
  get severity(): Severity {
    return this._severity;
  }
}

/**
 * Base URL to detectors documentation.
 */
export const BASE_DOC_URL =
  "https://nowarp.github.io/docs/misti/docs/detectors";

/**
 * Creates a link to the documentation for built-in detectors.
 */
export function makeDocURL(detectorName: string): string {
  return `${BASE_DOC_URL}/${detectorName}`;
}

/**
 * Constructs an error object with a description and the source code location.
 *
 * @param description Descriptive text of the error.
 * @param severity Severity of the finding.
 * @param loc Reference to the source code that includes file information and position data.
 * @param data Additional optional data for the error, including:
 * - `extraDescription`: More comprehensive description that clarifies the error in greater detail.
 * - `docURL`: URL to the lint documentation.
 * - `suggestion`: Suggested change in the source code.
 * @returns A new MistiTactError containing the error message and source code reference.
 */
export function createError(
  ctx: MistiContext,
  description: string,
  severity: Severity,
  loc: SrcInfo,
  data: Partial<{
    extraDescription: string;
    docURL: string;
    suggestion: string;
  }> = {},
): MistiTactError {
  const {
    extraDescription = undefined,
    docURL = undefined,
    suggestion = undefined,
  } = data;
  const pos = loc.file
    ? (() => {
        const lc = loc.interval.getLineAndColumn() as {
          lineNum: number;
          colNum: number;
        };
        const lcStr = `${lc}`;
        const lcLines = lcStr.split("\n");
        lcLines.shift();
        const contractPath =
          ctx.singleContractPath !== undefined
            ? ctx.singleContractPath
            : loc.file;
        const shownPath = path.relative(process.cwd(), contractPath);
        return `${shownPath}:${lc.lineNum}:${lc.colNum}:\n${lcLines.join("\n")}`;
      })()
    : "";
  const extraDescriptionStr =
    extraDescription === undefined ? "" : `: ${extraDescription}`;
  const suggestionStr = suggestion === undefined ? "" : `\nHelp: ${suggestion}`;
  const docURLStr = docURL === undefined ? "" : `\nSee: ${docURL}`;
  const msg = [
    pos,
    description,
    extraDescriptionStr,
    suggestionStr,
    docURLStr,
  ].join("");
  return new MistiTactError(msg, loc, severity);
}
