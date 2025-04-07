import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

describe("genJsonSchema functionality tests", () => {
  // Create a temp directory like civilized people
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "misti-test-"));
  const tempOutputPath = path.join(tempDir, "test-schema.json");
  const referenceOutputPath = path.resolve(__dirname, "../mistiOutput.json");

  afterAll(() => {
    if (fs.existsSync(tempOutputPath)) {
      fs.unlinkSync(tempOutputPath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  it("should generate a schema identical to the reference schema", () => {
    execSync(
      `ts-node ${path.resolve(__dirname, "./genJsonSchema.ts")} ${tempOutputPath}`,
      {
        stdio: "pipe",
      },
    );
    expect(fs.existsSync(tempOutputPath)).toBe(true);
    expect(fs.existsSync(referenceOutputPath)).toBe(true);

    const generatedSchema = JSON.parse(fs.readFileSync(tempOutputPath, "utf8"));
    const referenceSchema = JSON.parse(
      fs.readFileSync(referenceOutputPath, "utf8"),
    );
    expect(generatedSchema).toEqual(referenceSchema);
  });
});
