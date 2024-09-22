import { MISTI_VERSION, TACT_VERSION } from "../src/version";

describe("Version Tests", () => {
  test("MISTI_VERSION should start with a number", () => {
    expect(MISTI_VERSION).toMatch(/^\d/);
  });

  test("TACT_VERSION should start with a number", () => {
    expect(TACT_VERSION).toMatch(/^\d/);
  });
});
