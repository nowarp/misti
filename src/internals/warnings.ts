import { getMistiAnnotation } from "./annotation";
import { InternalException } from "./exceptions";
import { srcInfoToString } from "./tact";
import { SrcInfo } from "./tact/imports";

/**
 * Enumerates the levels of severity that can be assigned to detected findings.
 */
export enum Severity {
  INFO = 1,
  LOW,
  MEDIUM,
  HIGH,
  CRITICAL,
}

/**
 * Warning category.
 */
export enum Category {
  /** Any possible unintended behavior leading to bugs or vulnerabilities. */
  SECURITY = 0,
  /** Code improvements for gas-optimizations. */
  OPTIMIZATION,
  /** General code quality advices. */
  BEST_PRACTICES,
}

/**
 * Parses string input to corresponding Severity enum value.
 */
export function parseSeverity(value: string): Severity {
  return Severity[value.toUpperCase() as keyof typeof Severity];
}

/**
 * Returns string representation of `Severity` optionally wrapped in ANSI escape
 * sequences making them colorful for visual overload.
 */
export function severityToString(
  s: Severity,
  {
    colorize = false,
    brackets = true,
  }: Partial<{ colorize: boolean; brackets: boolean }> = {},
): string {
  const colors = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    low: "\x1b[32m", // Green
    medium: "\x1b[33m", // Yellow
    high: "\x1b[31m", // Red
    critical: "\x1b[35m", // Magenta
  };
  const severityString = (text: string, color?: string): string => {
    let result = text;
    if (brackets) {
      result = `[${result}]`;
    }
    if (colorize && color) {
      result = `${colors.bold}${color}${result}${colors.reset}`;
    }
    return result;
  };
  switch (s) {
    case Severity.INFO:
      return severityString("INFO");
    case Severity.LOW:
      return severityString("LOW", colors.low);
    case Severity.MEDIUM:
      return severityString("MEDIUM", colors.medium);
    case Severity.HIGH:
      return severityString("HIGH", colors.high);
    case Severity.CRITICAL:
      return severityString("CRITICAL", colors.critical);
  }
}

/**
 * Base URL to detectors documentation.
 */
export const BASE_DOC_URL = "https://nowarp.io/tools/misti/docs/detectors";

/**
 * Misti warning that highlights a specific place in a Tact contract.
 */
export class MistiTactWarning {
  /**
   * @param detectorId Unique identifier of the detector raised that warning.
   */
  constructor(
    public readonly detectorId: string,
    public readonly msg: string,
    public readonly loc: SrcInfo,
    public readonly severity: Severity,
    public readonly category: Category | undefined,
  ) {
    this.loc = loc;
  }

  /**
   * Constructs a warning object with a description and the source code location.
   *
   * @param description Descriptive text of the warning.
   * @param detectorId Unique identifier of the detector.
   * @param severity Severity of the warning.
   * @param severity Category of the warning.
   * @param loc Reference to the source code that includes file information and position data.
   * @param data Additional optional data for the warning, including:
   * - `extraDescription`: More comprehensive description that clarifies the warning in greater detail.
   * - `docURL`: URL to the detector documentation.
   * - `suggestion`: Suggested change in the source code.
   * @returns A new MistiTactWarning containing the warning message and source code reference.
   */
  public static make(
    detectorId: string,
    description: string,
    severity: Severity,
    category: Category | undefined,
    loc: SrcInfo,
    data: Partial<{
      extraDescription: string;
      docURL: string;
      suggestion: string;
    }> = {},
  ): MistiTactWarning | never {
    if (description.length === 0) {
      throw InternalException.make("description cannot be empty");
    }
    const {
      extraDescription = undefined,
      docURL = undefined,
      suggestion = undefined,
    } = data;
    const extraDescriptionStr =
      extraDescription === undefined ? "" : extraDescription + "\n";
    const suggestionStr = suggestion === undefined ? "" : `Help: ${suggestion}`;
    const docURLStr = docURL === undefined ? "" : `\nSee: ${docURL}`;
    const msg = [
      description,
      "\n",
      srcInfoToString(loc),
      extraDescriptionStr,
      suggestionStr,
      docURLStr,
    ].join("");
    return new MistiTactWarning(detectorId, msg, loc, severity, category);
  }

  /**
   * Checks whether this warning is suppressing using a Misti annotation.
   */
  public isSuppressed(): boolean {
    const annotation = getMistiAnnotation(this.loc);
    if (annotation && annotation.kind === "suppress") {
      return (
        annotation.detectors.find((d) => d === this.detectorId) !== undefined
      );
    }
    return false;
  }
}

/**
 * Creates a link to the documentation for built-in detectors.
 */
export function makeDocURL(detectorName: string): string {
  return `${BASE_DOC_URL}/${detectorName}`;
}
