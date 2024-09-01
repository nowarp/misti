import { SouffleContext, SouffleFact } from "..";
import { Transform, TransformCallback } from "stream";
import fs from "fs";

/**
 * Raw strings parsed from the Soufflé CSV-like output in the following format:
 * rule_name |-> [relation_name, fact_name]
 */
export type SouffleOutputRaw = string[][];

/**
 * Custom Transform Stream to parse space-separated values.
 */
export class SpaceSeparatedParser extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true });
  }

  _transform(
    chunk: Buffer | string,
    _: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const data = chunk.toString();
    const lines = data.split("\n").map((line) => line.trim());
    lines.forEach((line) => {
      if (line !== "") {
        const values = line.split(/\s+/);
        this.push(values);
      }
    });
    callback();
  }
}

/**
 * Parses CSV-like Soufflé output.
 */
export function parseSpaceSeparatedValues(input: string): SouffleOutputRaw {
  return input
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.trim())
    .reduce((acc, line) => {
      const strings = line.split(/\s+/);
      acc.push(strings);
      return acc;
    }, [] as SouffleOutputRaw);
}

/**
 * Structured Soufflé output that contains information about facts with additional
 * annotations added to the executed `Context`.
 */
export class SouffleOutputStructured<FactData> {
  private constructor(public entries: Map<string, SouffleFact<FactData>[]>) {}

  /**
   * Generates a structured Soufflé output from raw CSV-like strings.
   * @returns `undefined` if cannot unmarshall output.
   */
  static fromRaw<FactData>(
    ctx: SouffleContext<FactData>,
    rawOut: Map<string, SouffleOutputRaw>,
  ): SouffleOutputStructured<FactData> | undefined {
    const entries = new Map<string, SouffleFact<FactData>[]>();
    for (const [relationName, allFactValues] of rawOut.entries()) {
      const relation = ctx.getRelation(relationName);
      if (relation === undefined) {
        throw new Error(`Cannot find relation: ${relationName}`);
      }
      for (const factValues of allFactValues) {
        const typedFactValues = factValues.map((v) =>
          isNaN(Number(v)) ? v : Number(v),
        );
        const fact = ctx.findFact(typedFactValues);
        if (fact === undefined) {
          console.error(
            `Cannot find ${relationName} fact with values: ${typedFactValues}`,
          );
          return undefined;
        }
        let facts = entries.get(relationName);
        if (facts === undefined) {
          facts = [];
        }
        facts.push(fact);
        entries.set(relationName, facts);
      }
    }
    return new SouffleOutputStructured(entries);
  }
}

/**
 * Asynchronously parses a file into a `RawSouffleOutput`.
 * @param filePath Path to the file to parse.
 * @returns `RawSouffleOutput` containing the parsed data.
 */
export async function parseResults(
  filePath: string,
): Promise<SouffleOutputRaw> {
  return new Promise((resolve, reject) => {
    const results: SouffleOutputRaw = [];
    fs.createReadStream(filePath)
      .pipe(new SpaceSeparatedParser())
      .on("data", (data) => {
        results.push(data);
      })
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => {
        console.error("Error reading CSV file:", error);
        reject(error);
      });
  });
}

/**
 * Synchronously parses a file into a `SouffleExecutionResult`.
 * @param filePath Path to the file to parse.
 * @returns `RawSouffleOutput` containing the parsed data.
 */
export function parseResultsSync(filePath: string): SouffleOutputRaw {
  const data = fs.readFileSync(filePath, { encoding: "utf8" });
  return parseSpaceSeparatedValues(data);
}
