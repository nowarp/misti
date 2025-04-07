import { getMistiAnnotation } from "./annotation";
import { InternalException } from "./exceptions";
import { QuickFix } from "./quickfix";
import { quickFixToString } from "./quickfix";
import { SrcInfo } from "./tact/imports";
import { isTest, unreachable } from "./util";
import path from "path";

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
  SECURITY = 1,
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
 * sequences making it colorful for visual emphasis.
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

export function categoryToString(c: Category): string | never {
  switch (c) {
    case Category.OPTIMIZATION:
      return "Optimization";
    case Category.BEST_PRACTICES:
      return "Best Practices";
    case Category.SECURITY:
      return "Security";
    default:
      unreachable(c);
  }
}

/**
 * Base URL to detectors documentation.
 */
export const BASE_DOC_URL = "https://nowarp.io/tools/misti/docs/detectors";

/**
 * Source code location of the warning present in JSON output.
 */
export interface WarningLocation {
  /** Absolute path from the analyzer's process directory. */
  file: string;
  /** Line number. */
  line: number;
  /** Column number. */
  column: number;
  /** Lines of code in this location used in warning message */
  code: string;
}

/**
 * Misti warning that highlights a specific place in a Tact contract.
 */
export type Warning = {
  /** Unique identifier of the detector. */
  readonly detectorId: string;
  /** Descriptive text of the warning. */
  readonly description: string;
  /** Reference to the source code. */
  readonly location: WarningLocation;
  /** True if the warning is suppressed with a code annotation. */
  readonly suppressed: boolean;
  /** Severity of the warning. */
  readonly severity: Severity;
  /** Category of the warning. */
  readonly category: Category | undefined;
  /** More comprehensive description that clarifies the warning in greater detail. */
  readonly extraDescription: string;
  /** URL to the detector documentation. */
  readonly docURL: string;
  /** Suggested change in the source code (text description). */
  readonly suggestion: string;
  /** Optional code suggestions mainly for LSP code actions. */
  readonly quickfixes: QuickFix[];
};

/**
 * Converts SrcInfo to WarningLocation.
 */
export function makeWarningLocation(loc: SrcInfo): WarningLocation {
  const lc = loc.interval.getLineAndColumn() as {
    lineNum: number;
    colNum: number;
  };
  const code = loc.interval.getLineAndColumnMessage();
  const file = loc.file
    ? isTest()
      ? path.normalize(path.relative(process.cwd(), loc.file))
      : path.normalize(loc.file)
    : "<no file>";
  return { file, line: lc.lineNum, column: lc.colNum, code };
}

/**
 * Converts SrcInfo to the string representation shown to the user.
 */
export function warningLocationToString(wl: WarningLocation): string {
  return `${wl.file}:${wl.line}:${wl.column}:\n${wl.code}`;
}

export function makeWarning(
  detectorId: string,
  description: string,
  severity: Severity,
  category: Category | undefined,
  loc: SrcInfo,
  data: Partial<{
    extraDescription: string;
    docURL: string;
    suggestion: string;
    quickfixes: QuickFix[];
  }> = {
    extraDescription: undefined,
    docURL: undefined,
    suggestion: undefined,
    quickfixes: [],
  },
): Warning | never {
  if (description.length === 0) {
    throw InternalException.make("description cannot be empty");
  }
  const wl = makeWarningLocation(loc);
  return {
    detectorId,
    description,
    location: wl,
    suppressed: warningIsSuppressed(wl, detectorId),
    severity,
    category,
    extraDescription: data.extraDescription,
    docURL: data.docURL,
    suggestion: data.suggestion,
    quickfixes: data.quickfixes ? data.quickfixes : [],
  } as Warning;
}

/**
 * A braindead-simple hash to check if the warning has already been reported.
 */
export function hashWarning(warn: Warning): string {
  return [
    warn.detectorId,
    warn.location.file,
    warn.location.line,
    warn.location.column,
    warn.location.code,
    warn.description,
  ].join("%");
}

/**
 * Returns string representation of the warning according to the configuration.
 */
export function formatWarning(
  warn: Warning,
  colorize: boolean,
  addNewline: boolean,
): string {
  const extraDescriptionStr =
    warn.extraDescription === undefined ? "" : `${warn.extraDescription}\n`;
  const suggestedChange = (() => {
    const quickfixStr = warn.quickfixes
      .filter((qf) => qf.shown)
      .map((qf) => quickFixToString(qf))
      .join("\n");
    if (quickfixStr) {
      return `Help: ${quickfixStr}`;
    } else if (warn.suggestion !== undefined) {
      return `Help: ${warn.suggestion}`;
    } else {
      return "";
    }
  })();
  const docURLStr = warn.docURL === undefined ? "" : `\nSee: ${warn.docURL}`;
  const msg = [
    warn.description,
    "\n",
    warningLocationToString(warn.location),
    extraDescriptionStr,
    suggestedChange,
    docURLStr,
  ].join("");
  const severity = severityToString(warn.severity, {
    colorize,
  });
  return `${severity} ${warn.detectorId}: ${msg}${addNewline && !msg.endsWith("\n") ? "\n" : ""}`;
}

/**
 * Checks whether the warning is suppressing using a Misti annotation.
 */
export function warningIsSuppressed(
  wl: WarningLocation,
  detectorId: string,
): boolean {
  const annotation = getMistiAnnotation(wl.code);
  if (annotation && annotation.kind === "suppress") {
    return annotation.detectors.find((d) => d === detectorId) !== undefined;
  }
  return false;
}

/**
 * Creates a link to the documentation for built-in detectors.
 */
export function makeDocURL(detectorName: string): string {
  return `${BASE_DOC_URL}/${detectorName}`;
}
