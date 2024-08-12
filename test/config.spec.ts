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
    ignored_projects: ["ignoredProject"],
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should load and parse config file correctly", () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(MOCK_CONFIG_CONTENT);
    const configInstance = new MistiConfig({ configPath: MOCK_CONFIG_PATH });
    expect(configInstance.detectorsEnabled).toEqual([
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
});
