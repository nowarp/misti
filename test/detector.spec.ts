import { executeMisti } from "../src/cli";
import { DETECTORS_DIR } from "./testUtil";
import fs from "fs";
import JSONbig from "json-bigint";
import os from "os";
import path from "path";

const CONTRACT_NAME = "NeverAccessedVariables.tact";
const ABSOLUTE_PATH = path.resolve(__dirname, DETECTORS_DIR, CONTRACT_NAME);
const RELATIVE_PATH = path.relative(__dirname, ABSOLUTE_PATH);

describe("Common detectors functionality", () => {
  it(`should generate valid JSON output for ${CONTRACT_NAME}`, async () => {
    const filePath = ABSOLUTE_PATH;
    const output = await executeMisti([
      "--enabled-detectors",
      "NeverAccessedVariables",
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
      file: expect.stringContaining(CONTRACT_NAME),
      line: 31, // Updated to line 31
      col: 5,
      detectorId: "NeverAccessedVariables",
      severity: "MEDIUM",
      message: expect.stringContaining("Field f2 is never used"),
    });
    expect(firstWarning.message).toContain(`${CONTRACT_NAME}:31:5:`);
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
          position: `${RELATIVE_PATH}:31:5`,
        },
        {
          detector: "NeverAccessedVariables",
          position: `${RELATIVE_PATH}:2:5`,
        },
        {
          detector: "NeverAccessedVariables",
          position: `${RELATIVE_PATH}:24:5`,
        },
        {
          detector: "NeverAccessedVariables",
          position: `${RELATIVE_PATH}:71:9`,
        },
      ],
    };

    fs.writeFileSync(configPath, JSON.stringify(mockConfig, null, 2));
    const filePath = ABSOLUTE_PATH;
    const output = await executeMisti([
      "--all-detectors",
      "--no-colors",
      "--output-format",
      "json",
      "--config",
      configPath,
      filePath,
    ]);
    let jsonOutput: { kind: string };
    try {
      jsonOutput = JSONbig.parse(output);
    } catch (error) {
      console.error("Bad output:\n", output);
      throw error;
    }
    expect(jsonOutput.kind).toBe("ok");
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
