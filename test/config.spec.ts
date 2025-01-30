import { MistiConfig } from "../src/internals/config";
import { createVirtualFileSystem } from "../src/vfs/createVirtualFileSystem";

describe("Config class", () => {
  const MOCK_CONFIG_PATH = "./mistiConfig_mock.json";
  const MOCK_CONFIG_CONTENT = JSON.stringify({
    detectors: [
      { className: "ReadOnlyVariables" },
      { className: "ZeroAddress" },
    ],
    ignoredProjects: ["ignoredProject"],
  });

  const fs = createVirtualFileSystem(process.cwd(), {}, false);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should load and parse config file correctly", () => {
    fs.readFile = jest
      .fn()
      .mockReturnValue(Buffer.from(MOCK_CONFIG_CONTENT, "utf8"));
    const configInstance = new MistiConfig({
      configPath: MOCK_CONFIG_PATH,
      fs,
    });
    expect(configInstance.detectors).toEqual([
      { className: "ReadOnlyVariables" },
      { className: "ZeroAddress" },
    ]);
    expect(configInstance.ignoredProjects).toEqual(["ignoredProject"]);
  });

  it("throws an error when the config file cannot be read", () => {
    fs.readFile = jest.fn().mockImplementation(() => {
      throw new Error("Failed to read file");
    });
    expect(() => new MistiConfig({ configPath: MOCK_CONFIG_PATH, fs })).toThrow(
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
    fs.readFile = jest
      .fn()
      .mockReturnValue(Buffer.from(configWithSuppressions, "utf8"));

    const configInstance = new MistiConfig({
      configPath: MOCK_CONFIG_PATH,
      fs,
    });
    expect(configInstance.suppressions).toHaveLength(1);
    expect(configInstance.suppressions[0]).toMatchObject({
      detector: "ReadOnlyVariables",
      line: 10,
      col: 5,
    });
  });
});
