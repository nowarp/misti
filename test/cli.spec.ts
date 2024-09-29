import { runMistiCommand } from "../src/cli";
import { Runner } from "../src/cli";
import path from "path";

const TACT_CONFIG_PATH = path.join(__dirname, "./tact.config.json");

describe("CLI Argument Parsing", () => {
  it("should initialize driver with correct options when --verbose is provided", async () => {
    const args = ["--verbose", TACT_CONFIG_PATH];
    const runnerMakeSpy = jest.spyOn(Runner, "make");
    runnerMakeSpy.mockImplementation(async (): Promise<Runner> => {
      return {
        run: jest.fn(),
        getResult: jest.fn(),
        getDriver: jest.fn(),
      } as unknown as Runner;
    });
    await runMistiCommand(args);
    expect(runnerMakeSpy).toHaveBeenCalledWith(
      TACT_CONFIG_PATH,
      expect.objectContaining({
        verbose: true,
      }),
    );
    runnerMakeSpy.mockRestore(); // restore the original method
  });

  it("should initialize driver with correct options when --dump-cfg is provided", async () => {
    const args = ["--dump-cfg", "json", TACT_CONFIG_PATH];
    const runnerMakeSpy = jest.spyOn(Runner, "make");
    runnerMakeSpy.mockImplementation(async (): Promise<Runner> => {
      return {
        run: jest.fn(),
        getResult: jest.fn(),
        getDriver: jest.fn(),
      } as unknown as Runner;
    });
    await runMistiCommand(args);
    expect(runnerMakeSpy).toHaveBeenCalledWith(
      TACT_CONFIG_PATH,
      expect.objectContaining({
        dumpCfg: "json",
      }),
    );
    runnerMakeSpy.mockRestore();
  });

  it("should initialize driver with default options when no options are provided", async () => {
    const args = [TACT_CONFIG_PATH];
    const runnerMakeSpy = jest.spyOn(Runner, "make");
    runnerMakeSpy.mockImplementation(async (): Promise<Runner> => {
      return {
        run: jest.fn(),
        getResult: jest.fn(),
        getDriver: jest.fn(),
      } as unknown as Runner;
    });
    await runMistiCommand(args);
    const actualOptions = runnerMakeSpy.mock.calls[0][1];
    expect(actualOptions).toEqual(
      expect.objectContaining({
        verbose: false,
      }),
    );
    expect(actualOptions!.dumpCfg).toBeUndefined();
    runnerMakeSpy.mockRestore();
  });

  it("should return an error when invalid --detectors option is provided", async () => {
    const args = ["--detectors", "", TACT_CONFIG_PATH];
    const result = await runMistiCommand(args);
    expect(
      result !== undefined &&
        result.kind === "error" &&
        result.error.includes("non-empty list of detectors"),
    );
  });

  it("should throw an error when no Tact project is specified", async () => {
    const args = ["--verbose"];
    await expect(runMistiCommand(args)).rejects.toThrow(
      "`<TACT_CONFIG_PATH|TACT_FILE_PATH>` is required",
    );
  });
});
