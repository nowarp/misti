import { Driver } from "../../../src/driver";
import path from "path";

describe("ImplicitInit Detector Tests", () => {
  it("should detect an issue in the sample contract", async () => {
    const tactConfigPath = path.resolve(
      __dirname,
      "project",
      "tactConfig.json",
    );
    const mistiConfigPath = path.resolve(
      __dirname,
      "project",
      "mistiConfig.json",
    );

    const driver = await Driver.create(tactConfigPath, mistiConfigPath);

    expect(driver.detectors.length).toBe(1);
    expect(driver.detectors[0].id).toBe("II");

    const foundErrors = await driver.execute();
    // TODO(bh): Add an error here when Tact v1.3 with implicit inits is released.
    expect(foundErrors).toBe(false);
  });
});
