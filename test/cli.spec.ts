import { Driver, Result, runMistiCommand } from "../src/cli";
import path from "path";

const TACT_CONFIG_PATH = path.join(__dirname, "./tact.config.json");
const MISTI_CONFIG_PATH = path.join(__dirname, "./misti.config.json");

describe("CLI Argument Parsing", () => {
  it("should initialize driver with correct options when --verbose is provided", async () => {
    const args = ["--verbose", TACT_CONFIG_PATH];
    const driverMakeSpy = jest.spyOn(Driver, "create");
    driverMakeSpy.mockImplementation(async (): Promise<Driver> => {
      return {
        execute: jest.fn(),
      } as unknown as Driver;
    });
    await runMistiCommand(args);
    expect(driverMakeSpy).toHaveBeenCalledWith(
      [TACT_CONFIG_PATH],
      expect.objectContaining({
        verbose: true,
      }),
    );
    driverMakeSpy.mockRestore(); // restore the original method
  });

  it("should initialize driver with correct options when --output-format is provided", async () => {
    const args = ["--output-format", "json", TACT_CONFIG_PATH];
    const driverMakeSpy = jest.spyOn(Driver, "create");
    driverMakeSpy.mockImplementation(async (): Promise<Driver> => {
      return {
        execute: jest.fn(),
      } as unknown as Driver;
    });
    await runMistiCommand(args);
    expect(driverMakeSpy).toHaveBeenCalledWith(
      [TACT_CONFIG_PATH],
      expect.objectContaining({
        outputFormat: "json",
      }),
    );
    driverMakeSpy.mockRestore();
  });

  it("should save logs to JSON output when requested", async () => {
    const args = [
      "--souffle-binary",
      "/foo/bar", // To generate a warning
      "--output-format",
      "json",
      TACT_CONFIG_PATH,
    ];
    const [_, result] = await runMistiCommand(args);
    expect(result.logs).toBeDefined();
    expect(
      result.logs!.warn.find((w: string) =>
        w.includes("installation found"),
      ) !== undefined,
    ).toBe(true);
  });

  it("should initialize driver with default options when no options are provided", async () => {
    const args = [TACT_CONFIG_PATH];
    const driverMakeSpy = jest.spyOn(Driver, "create");
    driverMakeSpy.mockImplementation(async (): Promise<Driver> => {
      return {
        execute: jest.fn(),
      } as unknown as Driver;
    });
    await runMistiCommand(args);
    const actualOptions = driverMakeSpy.mock.calls[0][1];
    expect(actualOptions).toEqual(
      expect.objectContaining({
        verbose: false,
        outputFormat: "plain",
      }),
    );
    driverMakeSpy.mockRestore();
  });

  it("should return an error when invalid --enabled-detectors option is provided", async () => {
    const args = ["--enabled-detectors", "", TACT_CONFIG_PATH];
    const result = await runMistiCommand(args);
    expect(
      result !== undefined &&
        result[1].kind === "error" &&
        result[1].error.includes("non-empty list of detectors"),
    );
  });

  it("should return an error when no Tact project is specified", async () => {
    const args = ["--verbose"];
    const result = await runMistiCommand(args);
    expect(
      result !== undefined &&
        result[1].kind === "error" &&
        result[1].error.includes("Tact project or"),
    );
  });

  it("should return ok when no tools and detectors are specified", async () => {
    const args = ["--config", MISTI_CONFIG_PATH, TACT_CONFIG_PATH];
    const result = await runMistiCommand(args);
    expect((result as [Driver, Result])[1]).toEqual({ kind: "ok" });
  });
});
