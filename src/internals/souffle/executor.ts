import { exec, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { Transform, TransformCallback } from "stream";

import { Context, RelationName, Fact, FactValue } from ".";

/**
 * Custom Transform Stream to parse space-separated values.
 */
class SpaceSeparatedParser extends Transform {
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

export interface SouffleExecutorParams {
  /** Path to the Soufflé executable. */
  soufflePath?: string;
  /** Temporary directory to store input facts for Soufflé. */
  inputDir?: string;
  /** Temporary directory or path to CSV output from Soufflé. */
  outputDir?: string;
}

/**
 * Manages Soufflé execution context.
 */
export class Executor<FactData> {
  private soufflePath: string;
  private inputDir: string;
  private outputDir: string;

  constructor(params: Partial<SouffleExecutorParams> = {}) {
    const {
      soufflePath = "souffle",
      inputDir = "/tmp/misti/souffle",
      outputDir = "/tmp/misti/souffle",
    } = params;
    this.soufflePath = soufflePath;
    this.inputDir = inputDir;
    this.outputDir = outputDir;
  }

  /**
   * Produces a Soufflé command that returns output in the CSV format.
   */
  private makeSouffleCommand(ctx: Context<FactData>): string {
    const inputDirPath = path.join(this.inputDir, ctx.filename);
    return `${this.soufflePath} -F${this.inputDir} -D${this.outputDir} ${inputDirPath}`;
  }

  /**
   * Executes the Datalog program using the Soufflé engine.
   * @returns `SouffleExecutionResult` which contains the status of execution.
   */
  public async execute(
    ctx: Context<FactData>,
  ): Promise<SouffleExecutionResult<FactData>> {
    await fs.promises.mkdir(this.inputDir, { recursive: true });
    await ctx.dump(this.inputDir);
    const cmd = this.makeSouffleCommand(ctx);
    return new Promise((resolve, reject) => {
      exec(cmd, async (error, _, stderr) => {
        if (error) {
          reject({ success: false, stderr: `${error}` });
        } else if (stderr) {
          reject({ success: false, stderr: `${stderr}` });
        } else {
          try {
            const rawResults = await ctx
              .collectOutputNames()
              .reduce(async (accPromise, relationName) => {
                const acc = await accPromise;
                const filepath = path.join(
                  this.outputDir,
                  `${relationName}.csv`,
                );
                const rawResults = await this.parseResults(filepath);
                acc.set(relationName, rawResults);
                return acc;
              }, Promise.resolve(new Map<string, RawSouffleOutput>()));
            const results = ParsedSouffleOutput.fromRaw(ctx, rawResults);
            resolve({ success: true, results });
          } catch (parseError) {
            reject({ success: false, stderr: `${parseError}` });
          }
        }
      });
    });
  }

  /**
   * Asynchronously parses a file into a `RawSouffleOutput`.
   * @param filePath Path to the file to parse.
   * @returns `RawSouffleOutput` containing the parsed data.
   */
  public async parseResults(filePath: string): Promise<RawSouffleOutput> {
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
   * Executes the Datalog program using the Soufflé engine synchronously.
   * @returns `SouffleExecutionResult` which contains the status of execution.
   */
  public executeSync(ctx: Context<FactData>): SouffleExecutionResult<FactData> {
    try {
      fs.mkdirSync(this.inputDir, { recursive: true });
      ctx.dumpSync(this.inputDir);
      const cmd = this.makeSouffleCommand(ctx);
      execSync(cmd, { stdio: ["ignore", "ignore", "pipe"] });
      const rawResults = ctx
        .collectOutputNames()
        .reduce((acc, relationName) => {
          const filepath = path.join(this.outputDir, `${relationName}.csv`);
          acc.set(relationName, this.parseResultsSync(filepath));
          return acc;
        }, new Map<RelationName, RawSouffleOutput>());
      const results = ParsedSouffleOutput.fromRaw(ctx, rawResults);
      return { success: true, results };
    } catch (error) {
      return { success: false, stderr: `${error}` };
    }
  }

  /**
   * Synchronously parses a file into a `SouffleExecutionResult`.
   * @param filePath Path to the file to parse.
   * @returns `RawSouffleOutput` containing the parsed data.
   */
  public parseResultsSync(filePath: string): RawSouffleOutput {
    const data = fs.readFileSync(filePath, { encoding: "utf8" });
    return this.parseSpaceSeparatedValues(data);
  }

  /**
   * Parses CSV-like Soufflé output.
   */
  private parseSpaceSeparatedValues(input: string): RawSouffleOutput {
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
}

/**
 * Raw strings parsed from the Soufflé CSV-like output in the following format:
 * rule_name |-> [relation_name, fact_name]
 */
type RawSouffleOutput = string[][];

/**
 * Structured Soufflé output that contains information about facts with additional
 * annotations added to the executed `Context`.
 */
export class ParsedSouffleOutput<FactData> {
  public entries: Map<RelationName, Fact<FactValue, FactData>>;

  private constructor(entries: Map<RelationName, Fact<FactValue, FactData>>) {
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
    const entries = new Map<RelationName, Fact<FactValue, FactData>>();
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
        entries.set(relationName, fact);
      }
    }
    return new ParsedSouffleOutput(entries);
  }
}

/**
 * Encapsulates results of the Soufflé execution.
 */
export type SouffleExecutionResult<FactData> =
  | { success: true; results: ParsedSouffleOutput<FactData> }
  | { success: false; stderr: string };
