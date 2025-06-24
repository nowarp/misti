import { MISTI_VERSION } from "../version";
import { getMistiAnnotation } from "./annotation";
import { InternalException } from "./exceptions";
import { QuickFix } from "./quickfix";
import { quickFixToString } from "./quickfix";
import { SrcInfo } from "./tact/imports";
import { ansi, isTest, makeRelativePath, unreachable } from "./util";
import fs from "fs";
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
  const severityString = (text: string, color?: string): string => {
    let result = text;
    if (brackets) {
      result = `[${result}]`;
    }
    if (colorize && color) {
      result = `${ansi.bold}${color}${result}${ansi.reset}`;
    }
    return result;
  };
  switch (s) {
    case Severity.INFO:
      return severityString("INFO");
    case Severity.LOW:
      return severityString("LOW", ansi.green);
    case Severity.MEDIUM:
      return severityString("MEDIUM", ansi.yellow);
    case Severity.HIGH:
      return severityString("HIGH", ansi.red);
    case Severity.CRITICAL:
      return severityString("CRITICAL", ansi.magenta);
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
      ? makeRelativePath(loc.file)
      : path.normalize(loc.file)
    : "<no file>";
  return { file, line: lc.lineNum, column: lc.colNum, code };
}

/**
 * Converts SrcInfo to the string representation shown to the user.
 */
export function warningLocationToString(wl: WarningLocation): string {
  return `${makeRelativePath(wl.file)}:${wl.line}:${wl.column}:\n${wl.code}`;
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

/**
 * SARIF types for conversion
 */
export interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note" | "none";
  message: {
    text: string;
  };
  locations: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string;
      };
      region: {
        startLine: number;
        startColumn: number;
      };
    };
  }>;
  properties?: {
    category?: string;
    severity?: string;
    detectorId?: string;
    extraDescription?: string;
    docURL?: string;
    suggestion?: string;
  };
}

export interface SarifReport {
  $schema: string;
  version: "2.1.0";
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version?: string;
        informationUri?: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: {
            text: string;
          };
          fullDescription?: {
            text: string;
          };
          helpUri?: string;
          properties?: {
            category?: string;
            severity?: string;
          };
        }>;
      };
    };
    automationDetails?: {
      id: string;
    };
    invocations: Array<{
      commandLine?: string;
      arguments?: string[];
      responseFiles?: Array<{
        uri: string;
        contents?: {
          text: string;
        };
      }>;
      startTimeUtc?: string;
      endTimeUtc?: string;
      exitCode?: number;
      executionSuccessful: boolean;
      workingDirectory?: {
        uri: string;
      };
    }>;
    results: SarifResult[];
  }>;
}

/**
 * Converts a Misti severity to SARIF level.
 */
function severityToSarifLevel(
  severity: Severity,
): "error" | "warning" | "note" | "none" {
  switch (severity) {
    case Severity.CRITICAL:
    case Severity.HIGH:
      return "error";
    case Severity.MEDIUM:
    case Severity.LOW:
      return "warning";
    case Severity.INFO:
      return "note";
    default:
      return "none";
  }
}

/**
 * Finds the git repository root by walking up the directory tree looking for .git folder.
 * @param startPath The path to start searching from (file or directory)
 * @returns The git repository root path or null if not found
 */
function findGitRepositoryRoot(startPath: string): string | null {
  let currentDir: string;
  if (path.isAbsolute(startPath)) {
    try {
      currentDir = fs.statSync(startPath).isDirectory()
        ? startPath
        : path.dirname(startPath);
    } catch {
      // File doesn't exist, assume it's a file path and use its directory
      currentDir = path.dirname(startPath);
    }
  } else {
    currentDir = path.resolve(startPath);
  }
  while (currentDir !== path.parse(currentDir).root) {
    const gitPath = path.join(currentDir, ".git");
    if (fs.existsSync(gitPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Converts a Warning to SARIF result format.
 */
export function warningToSarifResult(
  warning: Warning,
  repositoryRoot?: string,
): SarifResult {
  // Convert absolute paths to relative paths for proper repository mapping
  const getRelativeUri = (filePath: string): string => {
    // If it's already a relative path, keep it as is
    if (!path.isAbsolute(filePath)) {
      return filePath;
    }

    // In test environments, if the path looks like a mock path, just return it as-is
    if (
      isTest() &&
      (filePath.startsWith("/test/") || filePath.startsWith("/mock/"))
    ) {
      return filePath;
    }

    // Start with the provided repository root
    let basePath = repositoryRoot;

    // For SARIF, we want the actual git repository root, not just the minimum Tact project path
    // So if we have a repositoryRoot, try to find a git root that contains it
    if (basePath) {
      const gitRoot = findGitRepositoryRoot(basePath);
      if (gitRoot && basePath.startsWith(gitRoot)) {
        basePath = gitRoot;
      }
    } else {
      // If no repository root provided, try to find the git repository root from the file path
      basePath = findGitRepositoryRoot(filePath) || undefined;
    }

    // Fall back to current working directory if we still don't have a base path
    if (!basePath) {
      basePath = process.cwd();
    }

    // Make the path relative to the base path
    if (filePath.startsWith(basePath)) {
      return path.relative(basePath, filePath);
    }

    // If file is outside the base path, we still try to make it relative
    // This can happen in test scenarios or complex project setups
    return path.relative(basePath, filePath);
  };

  const result: SarifResult = {
    ruleId: warning.detectorId,
    level: severityToSarifLevel(warning.severity),
    message: {
      text: warning.description,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: getRelativeUri(warning.location.file),
          },
          region: {
            startLine: warning.location.line,
            startColumn: warning.location.column,
          },
        },
      },
    ],
  };

  // Add optional properties
  const properties: Record<string, string> = {};
  if (warning.category !== undefined) {
    properties.category = categoryToString(warning.category);
  }
  properties.severity = Severity[warning.severity];
  properties.detectorId = warning.detectorId;
  if (warning.extraDescription !== undefined) {
    properties.extraDescription = warning.extraDescription;
  }
  if (warning.docURL !== undefined) {
    properties.docURL = warning.docURL;
  }
  if (warning.suggestion !== undefined) {
    properties.suggestion = warning.suggestion;
  }

  if (Object.keys(properties).length > 0) {
    result.properties = properties;
  }

  return result;
}

/**
 * Converts an array of warnings to a complete SARIF report.
 */
export function warningsToSarifReport(
  warnings: Warning[],
  executionSuccessful: boolean = true,
  exitCode: number = 0,
  repositoryRoot?: string,
): SarifReport {
  // Extract unique detector rules
  const ruleMap = new Map<string, Warning>();
  warnings.forEach((warning) => {
    if (!ruleMap.has(warning.detectorId)) {
      ruleMap.set(warning.detectorId, warning);
    }
  });

  const rules = Array.from(ruleMap.values()).map((warning) => ({
    id: warning.detectorId,
    name: warning.detectorId,
    shortDescription: {
      text: warning.description,
    },
    fullDescription: warning.extraDescription
      ? {
          text: warning.extraDescription,
        }
      : undefined,
    helpUri: warning.docURL || undefined,
    properties: {
      category: warning.category
        ? categoryToString(warning.category)
        : undefined,
      severity: Severity[warning.severity],
    },
  }));

  const results = warnings.map((warning) =>
    warningToSarifResult(warning, repositoryRoot),
  );

  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Misti",
            version: MISTI_VERSION,
            informationUri: "https://nowarp.io/tools/misti",
            rules,
          },
        },
        automationDetails: {
          id: "misti-analysis",
        },
        invocations: [
          {
            commandLine: process.argv.join(" "),
            arguments: process.argv.slice(2),
            startTimeUtc: new Date().toISOString(),
            exitCode: exitCode,
            executionSuccessful: executionSuccessful,
            workingDirectory: {
              uri: `file://${process.cwd()}`,
            },
          },
        ],
        results,
      },
    ],
  };
}
