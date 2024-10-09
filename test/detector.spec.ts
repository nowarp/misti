import { executeMisti } from "../src/cli";
import fs from "fs";
import JSONbig from "json-bigint";
import os from "os";
import path from "path";

describe("Common detectors functionality", () => {
  it("should generate valid JSON output for never-accessed.tact", async () => {
    const filePath = path.resolve(__dirname, "good", "never-accessed.tact");
    const output = await executeMisti([
      "--all-detectors",
      "--no-colors",
      "--output-format",
      "json",
      filePath,
    ]);
    let jsonOutput: any;
    try {
      jsonOutput = JSONbig.parse(output);
    } catch (error) {
      console.error("Bad output:\n", output);
      throw error;
    }
    expect(jsonOutput.warnings.length).toBeGreaterThan(0);
    const firstWarning = JSONbig.parse(jsonOutput.warnings[0].warnings[0]);

    // Match the warning for "Field f2 is never used"
    expect(firstWarning).toMatchObject({
      file: expect.stringContaining("never-accessed.tact"),
      line: 31, // Updated to line 31
      col: 5,
      detectorId: "NeverAccessedVariables",
      severity: "MEDIUM",
      message: expect.stringContaining("Field f2 is never used"),
    });
    expect(firstWarning.message).toContain(
      "test/good/never-accessed.tact:31:5:",
    );
    expect(firstWarning.message).toContain(
      "Help: Consider creating a constant instead of field",
    );
    expect(firstWarning.message).toContain(
      "See: https://nowarp.io/tools/misti/docs/detectors/NeverAccessedVariables",
    );
  });

  it("should respect suppressions in config file", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "misti-test-"));
    const configPath = path.join(tempDir, "misti.config.json");
    const mockConfig = {
      detectors: [{ className: "NeverAccessedVariables" }],
      tools: [],
      ignoredProjects: [],
      unusedPrefix: "_",
      verbosity: "quiet",
      suppressions: [
        {
          detector: "NeverAccessedVariables",
          position: "test/good/never-accessed.tact:31:5",
        },
        {
          detector: "NeverAccessedVariables",
          position: "test/good/never-accessed.tact:2:5",
        },
        {
          detector: "NeverAccessedVariables",
          position: "test/good/never-accessed.tact:24:5",
        },
        {
          detector: "NeverAccessedVariables",
          position: "test/good/never-accessed.tact:71:9",
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(mockConfig, null, 2));
    const filePath = path.resolve(__dirname, "good", "never-accessed.tact");
    const output = await executeMisti([
      "--all-detectors",
      "--no-colors",
      "--output-format",
      "json",
      "--config",
      configPath,
      filePath,
    ]);
    let jsonOutput: { warnings: any };
    try {
      jsonOutput = JSONbig.parse(output);
    } catch (error) {
      console.error("Bad output:\n", output);
      throw error;
    }
    expect(jsonOutput.warnings).toHaveLength(0);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
