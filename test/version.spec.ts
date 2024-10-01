import { MISTI_VERSION, TACT_VERSION } from "../src/version";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

describe("Version Tests", () => {
  test("MISTI_VERSION should start with a number", () => {
    expect(MISTI_VERSION).toMatch(/^\d/);
  });

  test("TACT_VERSION should start with a number", () => {
    expect(TACT_VERSION).toMatch(/^\d/);
  });
});

describe("MISTI_VERSION Tests", () => {
  const versionFilePath = path.join(__dirname, "..", "src", "version-info.ts");
  let originalVersionContent: string;

  beforeAll(() => {
    originalVersionContent = fs.readFileSync(versionFilePath, "utf8");
  });

  afterAll(() => {
    fs.writeFileSync(versionFilePath, originalVersionContent, "utf8");
  });

  beforeEach(() => {
    jest.resetModules();
  });

  test("MISTI_VERSION is a valid semver when MISTI_RELEASE is '1'", () => {
    execSync(`yarn gen`, {
      env: { ...process.env, MISTI_RELEASE: "1" },
    });
    const { MISTI_VERSION } = require("../src/version-info");
    const semverRegex = /^\d+\.\d+\.\d+$/;
    expect(MISTI_VERSION).toMatch(semverRegex);
  });

  test("MISTI_VERSION includes git revision when MISTI_RELEASE is not set", () => {
    execSync(`yarn gen`, {
      env: { ...process.env, MISTI_RELEASE: undefined },
    });
    const { MISTI_VERSION } = require("../src/version-info");
    const semverWithGitRevisionRegex = /^\d+\.\d+\.\d+-[a-f0-9]+$/;
    expect(MISTI_VERSION).toMatch(semverWithGitRevisionRegex);
  });
});
