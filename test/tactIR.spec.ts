import { run } from "../src/driver";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "@jest/globals";

const CONTRACTS_DIR = path.resolve(__dirname, "contracts");

// Generates a Tact configuration file for the given contract
async function generateConfig(contractName: string): Promise<string> {
  const config = {
    projects: [
      {
        name: `${contractName}`,
        path: `./${contractName}.tact`,
        output: `./output`,
        options: {},
      },
    ],
  };
  const configPath = path.join(CONTRACTS_DIR, `${contractName}.config.json`);
  await fs.promises.writeFile(configPath, JSON.stringify(config), "utf8");
  return configPath;
}

// Compares JSON outputs
async function compareOutputs(contractName: string): Promise<void> {
  const actualPath = path.join(CONTRACTS_DIR, `${contractName}.json`);
  const expectedPath = path.join(
    CONTRACTS_DIR,
    `${contractName}.expected.json`,
  );
  const [actual, expected] = await Promise.all([
    fs.promises.readFile(actualPath, "utf8"),
    fs.promises.readFile(expectedPath, "utf8"),
  ]);
  expect(JSON.parse(actual)).toEqual(JSON.parse(expected));
}

// Saves outputs as expected results
async function bless(contractName: string): Promise<void> {
  const actualPath = path.join(CONTRACTS_DIR, `${contractName}.json`);
  const expectedPath = path.join(
    CONTRACTS_DIR,
    `${contractName}.expected.json`,
  );
  const actualOutput = await fs.promises.readFile(actualPath, "utf8");
  await fs.promises.writeFile(expectedPath, actualOutput);
}

if (process.env.BLESS === "1") {
  console.log(`Updating expected outputs...`);
}

// Dynamically create tests for each contract
fs.readdirSync(CONTRACTS_DIR)
  .filter((file) => file.endsWith(".tact"))
  .forEach((file) => {
    const contractName = file.replace(".tact", "");
    describe(`Testing contract: ${contractName}`, () => {
      it(`should produce the correct CFG JSON output for ${contractName}`, async () => {
        const configPath = await generateConfig(contractName);
        await run(configPath, {
          dumpCfg: "json",
          dumpCfgStdlib: false,
          dumpCfgOutput: CONTRACTS_DIR,
          quiet: true,
        });
        if (process.env.BLESS === "1") {
          // Bless test outputs if requested
          await bless(contractName);
        } else {
          // Otherwise, compare results
          await compareOutputs(contractName);
        }
      });
    });
  });

