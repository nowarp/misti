import * as path from "path";
import * as os from "os";
import fs from "fs-extra";
import { execSync, ExecSyncOptions } from "child_process";
import { ExitCode } from "../src/cli/types";

describe("Misti `main` tests", () => {
  beforeAll(() => {
    execSync("yarn build");
  });

  function sanitizeYarnOutput(output: string): string {
    const lines = output.split("\n");
    return lines.slice(1, -1).join("\n").trim();
  }

  function safeExecSync(command: string): { output: string; exitCode: number } {
    const options: ExecSyncOptions = { stdio: "pipe", encoding: "utf-8" };
    try {
      const output = execSync(command, options);
      return { output: output.toString().trim(), exitCode: 0 };
    } catch (error: any) {
      return {
        output: error.stdout?.toString().trim() || "",
        exitCode: error.status || 1,
      };
    }
  }

  it("should produce the same output for `yarn misti` and `./bin/misti`", () => {
    const testContract = "test/detectors/NeverAccessedVariables.tact";
    const yarnResult = safeExecSync(`yarn misti ${testContract}`);
    const binResult = safeExecSync(`./bin/misti ${testContract}`);

    // Both commands should exit with code 1
    expect(yarnResult.exitCode).toBe(ExitCode.WARNINGS);
    expect(binResult.exitCode).toBe(ExitCode.WARNINGS);

    // Compare the sanitized outputs
    expect(sanitizeYarnOutput(yarnResult.output)).toBe(binResult.output);
  });

  it("should exit with a non-zero code when execution fails", () => {
    const nonExistentFile = "foo/bar/non-existent-file.tact";

    // Test yarn misti
    try {
      execSync(`yarn misti ${nonExistentFile}`, { stdio: "pipe" });
      fail("Expected yarn misti to throw an error");
    } catch (error: any) {
      expect(error.status).not.toBe(0);
    }

    // Test ./bin/misti
    try {
      execSync(`./bin/misti ${nonExistentFile}`, { stdio: "pipe" });
      fail("Expected ./bin/misti to throw an error");
    } catch (error: any) {
      expect(error.status).not.toBe(0);
    }
  });

  it("should return exit code 2 for invalid contract syntax", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "misti-test-"));
    const tempFilePath = path.join(tempDir, "invalid-contract.tact");
    fs.writeFileSync(tempFilePath, "contract A {\n\n", "utf8");
    try {
      const result = safeExecSync(`yarn misti ${tempFilePath}`);
      expect(result.exitCode).toBe(ExitCode.EXECUTION_FAILURE);
    } finally {
      fs.unlinkSync(tempFilePath);
      fs.rmdirSync(tempDir);
    }
  });
});
