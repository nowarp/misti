import { Context, RelationName, Fact, FactValue } from "..";
import { Transform, TransformCallback } from "stream";
import fs from "fs";

/**
 * Raw strings parsed from the Soufflé CSV-like output in the following format:
 * rule_name |-> [relation_name, fact_name]
 */
export type RawSouffleOutput = string[][];

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
export function parseSpaceSeparatedValues(input: string): RawSouffleOutput {
  return input
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.trim())
    .reduce((acc, line) => {
      const strings = line.split(/\s+/);
      acc.push(strings);
      return acc;
    }, [] as RawSouffleOutput);
}

/**
 * Structured Soufflé output that contains information about facts with additional
 * annotations added to the executed `Context`.
 */
export class ParsedSouffleOutput<FactData> {
  public entries: Map<RelationName, Fact<FactValue, FactData>[]>;

  private constructor(entries: Map<RelationName, Fact<FactValue, FactData>[]>) {
    this.entries = entries;
  }

  /**
   * Generates a structured Soufflé output from raw CSV strings and the given Context.
   * @throws If the given output cannot be unmarshalled using the given program.
   */
  static fromRaw<FactData>(
    ctx: Context<FactData>,
    rawOut: Map<RelationName, RawSouffleOutput>,
  ): ParsedSouffleOutput<FactData> {
    const entries = new Map<RelationName, Fact<FactValue, FactData>[]>();
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
          throw new Error(`Cannot find fact with values: ${typedFactValues}`);
        }
        let facts = entries.get(relationName);
        if (facts === undefined) {
          facts = [];
        }
        facts.push(fact);
        entries.set(relationName, facts);
      }
    }
    return new ParsedSouffleOutput(entries);
  }
}

/**
 * Asynchronously parses a file into a `RawSouffleOutput`.
 * @param filePath Path to the file to parse.
 * @returns `RawSouffleOutput` containing the parsed data.
 */
export async function parseResults(
  filePath: string,
): Promise<RawSouffleOutput> {
  return new Promise((resolve, reject) => {
    const results: RawSouffleOutput = [];
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
export function parseResultsSync(filePath: string): RawSouffleOutput {
  const data = fs.readFileSync(filePath, { encoding: "utf8" });
  return parseSpaceSeparatedValues(data);
}
