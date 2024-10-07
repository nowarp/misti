import { execSync } from "child_process";

describe("Misti `main` tests", () => {
  function sanitizeYarnOutput(output: string): string {
    const lines = output.split("\n");
    return lines.slice(1).join("\n").trim();
  }

  it("should produce the same output for `yarn misti` and `./bin/misti`", () => {
    // Run `yarn misti`
    const yarnMistiOutput = execSync("yarn misti test/good/never-accessed.tact")
      .toString()
      .trim();

    // Run `yarn build && ./bin/misti`
    execSync("yarn build");
    const binMistiOutput = execSync("./bin/misti test/good/never-accessed.tact")
      .toString()
      .trim();

    expect(sanitizeYarnOutput(yarnMistiOutput)).toBe(binMistiOutput);
  });
});
