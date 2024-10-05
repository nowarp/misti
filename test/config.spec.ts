import { MistiConfig } from "../src/internals/config";
import * as fs from "fs";

jest.mock("fs");

describe("Config class", () => {
  const MOCK_CONFIG_PATH = "./mistiConfig_mock.json";
  const MOCK_CONFIG_CONTENT = JSON.stringify({
    detectors: [
      { className: "ReadOnlyVariables" },
      { className: "ZeroAddress" },
    ],
    ignoredProjects: ["ignoredProject"],
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should load and parse config file correctly", () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(MOCK_CONFIG_CONTENT);
    const configInstance = new MistiConfig({ configPath: MOCK_CONFIG_PATH });
    expect(configInstance.detectors).toEqual([
      { className: "ReadOnlyVariables" },
      { className: "ZeroAddress" },
    ]);
    expect(configInstance.ignoredProjects).toEqual(["ignoredProject"]);
  });

  it("throws an error when the config file cannot be read", () => {
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("Failed to read file");
    });
    expect(() => new MistiConfig({ configPath: MOCK_CONFIG_PATH })).toThrow(
      "Failed to read file",
    );
  });

  it("should parse suppressions correctly", () => {
    const configWithSuppressions = JSON.stringify({
      detectors: [{ className: "ReadOnlyVariables" }],
      suppressions: [
        { detector: "ReadOnlyVariables", position: "file.tact:10:5" },
      ],
    });
    (fs.readFileSync as jest.Mock).mockReturnValue(configWithSuppressions);
    const configInstance = new MistiConfig({ configPath: MOCK_CONFIG_PATH });
    expect(configInstance.suppressions).toEqual([
      { detector: "ReadOnlyVariables", file: "file.tact", line: 10, col: 5 },
    ]);
  });
});
