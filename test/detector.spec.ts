import { executeMisti } from "../src/cli";
import JSONbig from "json-bigint";
import fs from "fs";
import path from "path";
import os from "os";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let jsonOutput: any;
    try {
      jsonOutput = JSONbig.parse(output);
    } catch (error) {
      console.error("Bad output:\n", output);
      throw error;
    }
    expect(jsonOutput.warnings.length).toBeGreaterThan(0);
    const firstWarning = JSONbig.parse(jsonOutput.warnings[0].warnings[0]);
    expect(firstWarning).toMatchObject({
      file: expect.stringContaining("never-accessed.tact"),
      line: expect.any(Number),
      col: expect.any(Number),
      detectorId: "NeverAccessedVariables",
      severity: "MEDIUM",
      message: expect.stringContaining("Write-only variable: a"),
    });
    expect(firstWarning.message).toContain(
      "test/good/never-accessed-1.tact:2:5:",
    );
    expect(firstWarning.message).toContain(
      "Help: The variable value should be accessed",
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
          position: "never-accessed.tact:2:5",
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
