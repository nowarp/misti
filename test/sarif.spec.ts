import {
  Warning,
  Severity,
  Category,
  warningToSarifResult,
  warningsToSarifReport,
  WarningLocation,
} from "../src/internals/warnings";
import { resultToString } from "../src/cli/result";
import { ResultWarnings } from "../src/cli/result";
import { MISTI_VERSION } from "../src/version";

describe("SARIF Output", () => {
  const createMockWarning = (overrides: Partial<Warning> = {}): Warning => ({
    detectorId: "TestDetector",
    description: "Test warning description",
    location: {
      file: "/test/file.tact",
      line: 10,
      column: 5,
      code: "test code line",
    } as WarningLocation,
    suppressed: false,
    severity: Severity.HIGH,
    category: Category.SECURITY,
    extraDescription: "Extra details about the warning",
    docURL: "https://example.com/docs/TestDetector",
    suggestion: "Consider fixing this issue",
    quickfixes: [],
    ...overrides,
  });

  describe("warningToSarifResult", () => {
    it("should convert a warning to SARIF result format", () => {
      const warning = createMockWarning();
      const sarifResult = warningToSarifResult(warning);

      expect(sarifResult.ruleId).toBe("TestDetector");
      expect(sarifResult.level).toBe("error"); // HIGH severity maps to error
      expect(sarifResult.message.text).toBe("Test warning description");
      expect(sarifResult.locations).toHaveLength(1);
      expect(
        sarifResult.locations[0].physicalLocation.artifactLocation.uri,
      ).toBe("file:///test/file.tact");
      expect(sarifResult.locations[0].physicalLocation.region.startLine).toBe(
        10,
      );
      expect(sarifResult.locations[0].physicalLocation.region.startColumn).toBe(
        5,
      );
      expect(sarifResult.properties).toBeDefined();
      expect(sarifResult.properties!.category).toBe("Security");
      expect(sarifResult.properties!.severity).toBe("HIGH");
      expect(sarifResult.properties!.detectorId).toBe("TestDetector");
      expect(sarifResult.properties!.extraDescription).toBe(
        "Extra details about the warning",
      );
      expect(sarifResult.properties!.docURL).toBe(
        "https://example.com/docs/TestDetector",
      );
      expect(sarifResult.properties!.suggestion).toBe(
        "Consider fixing this issue",
      );
    });

    it("should handle different severity levels correctly", () => {
      const criticalWarning = createMockWarning({
        severity: Severity.CRITICAL,
      });
      expect(warningToSarifResult(criticalWarning).level).toBe("error");

      const highWarning = createMockWarning({ severity: Severity.HIGH });
      expect(warningToSarifResult(highWarning).level).toBe("error");

      const mediumWarning = createMockWarning({ severity: Severity.MEDIUM });
      expect(warningToSarifResult(mediumWarning).level).toBe("warning");

      const lowWarning = createMockWarning({ severity: Severity.LOW });
      expect(warningToSarifResult(lowWarning).level).toBe("note");

      const infoWarning = createMockWarning({ severity: Severity.INFO });
      expect(warningToSarifResult(infoWarning).level).toBe("note");
    });

    it("should handle warnings without optional fields", () => {
      const minimalWarning = createMockWarning({
        category: undefined,
        extraDescription: "",
        docURL: "",
        suggestion: "",
      });
      const sarifResult = warningToSarifResult(minimalWarning);

      expect(sarifResult.properties!.category).toBeUndefined();
      expect(sarifResult.properties!.extraDescription).toBe("");
      expect(sarifResult.properties!.docURL).toBe("");
      expect(sarifResult.properties!.suggestion).toBe("");
    });
  });

  describe("warningsToSarifReport", () => {
    it("should convert multiple warnings to a complete SARIF report", () => {
      const warnings = [
        createMockWarning({ detectorId: "Detector1", severity: Severity.HIGH }),
        createMockWarning({
          detectorId: "Detector2",
          severity: Severity.MEDIUM,
        }),
        createMockWarning({ detectorId: "Detector1", severity: Severity.LOW }), // Duplicate detector
      ];

      const sarifReport = warningsToSarifReport(warnings);

      expect(sarifReport.$schema).toBe(
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
      );
      expect(sarifReport.version).toBe("2.1.0");
      expect(sarifReport.runs).toHaveLength(1);

      const run = sarifReport.runs[0];
      expect(run.tool.driver.name).toBe("Misti");
      expect(run.tool.driver.version).toBe(MISTI_VERSION);
      expect(run.tool.driver.informationUri).toBe(
        "https://nowarp.io/tools/misti",
      );

      // Should have 2 unique rules (Detector1 and Detector2)
      expect(run.tool.driver.rules).toHaveLength(2);
      expect(run.tool.driver.rules.map((r) => r.id)).toContain("Detector1");
      expect(run.tool.driver.rules.map((r) => r.id)).toContain("Detector2");

      // Should have 3 results (all warnings)
      expect(run.results).toHaveLength(3);
    });

    it("should handle empty warnings array", () => {
      const sarifReport = warningsToSarifReport([]);

      expect(sarifReport.runs[0].tool.driver.rules).toHaveLength(0);
      expect(sarifReport.runs[0].results).toHaveLength(0);
    });

    it("should create proper rule definitions", () => {
      const warning = createMockWarning({
        detectorId: "TestRule",
        description: "Rule description",
        extraDescription: "Detailed rule explanation",
        docURL: "https://docs.example.com/testrule",
        category: Category.OPTIMIZATION,
        severity: Severity.MEDIUM,
      });

      const sarifReport = warningsToSarifReport([warning]);
      const rule = sarifReport.runs[0].tool.driver.rules[0];

      expect(rule.id).toBe("TestRule");
      expect(rule.name).toBe("TestRule");
      expect(rule.shortDescription.text).toBe("Rule description");
      expect(rule.fullDescription!.text).toBe("Detailed rule explanation");
      expect(rule.helpUri).toBe("https://docs.example.com/testrule");
      expect(rule.properties!.category).toBe("Optimization");
      expect(rule.properties!.severity).toBe("MEDIUM");
    });
  });

  describe("resultToString with SARIF format", () => {
    it("should convert warnings result to SARIF JSON string", () => {
      const warning = createMockWarning();
      const result: ResultWarnings = {
        kind: "warnings",
        warnings: [warning],
      };

      const sarifString = resultToString(result, "sarif", false);
      const parsedSarif = JSON.parse(sarifString);

      expect(parsedSarif.$schema).toBe(
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
      );
      expect(parsedSarif.version).toBe("2.1.0");
      expect(parsedSarif.runs).toHaveLength(1);
      expect(parsedSarif.runs[0].results).toHaveLength(1);
    });

    it("should convert OK result to empty SARIF report", () => {
      const result = { kind: "ok" as const };
      const sarifString = resultToString(result, "sarif", false);
      const parsedSarif = JSON.parse(sarifString);

      expect(parsedSarif.runs[0].results).toHaveLength(0);
      expect(parsedSarif.runs[0].tool.driver.rules).toHaveLength(0);
    });

    it("should throw error for tool results with SARIF format", () => {
      const result = {
        kind: "tool" as const,
        output: [
          {
            name: "TestTool",
            projectName: "TestProject",
            output: "tool output",
          },
        ],
      };

      expect(() => resultToString(result, "sarif", false)).toThrow(
        "SARIF format is not supported for tool results",
      );
    });

    it("should throw error for error results with SARIF format", () => {
      const result = {
        kind: "error" as const,
        error: "Test error message",
      };

      expect(() => resultToString(result, "sarif", false)).toThrow(
        "SARIF format is not supported for error results: Test error message",
      );
    });
  });
});
