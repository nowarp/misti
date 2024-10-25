import { execSync, ExecSyncOptions } from "child_process";

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
    expect(yarnResult.exitCode).toBe(1);
    expect(binResult.exitCode).toBe(1);

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
});
