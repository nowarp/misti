import { Driver, MistiResultWarnings } from "../../../src/cli";
import path from "path";
import { createNodeFileSystem } from "../../../src/vfs/createNodeFileSystem";

describe("ImplicitInit Detector Tests", () => {
  const fs = createNodeFileSystem(process.cwd());
  it("should detect an issue in the sample contract", async () => {
    const tactConfigPath = path.resolve(
      __dirname,
      "project",
      "tactConfig.json",
    );
    const config = path.resolve(__dirname, "project", "mistiConfig.json");
    const driver = await Driver.create([tactConfigPath], { config, fs });

    expect(driver.detectors.length).toBe(1);
    expect(driver.detectors[0].id).toBe("ImplicitInit");

    const result = await driver.execute();
    expect((result as MistiResultWarnings).warnings.length).toBe(1);
  });
});
