import { SouffleContext } from "..";
import { SouffleEmitter } from "..";
import {
  RawSouffleOutput,
  ParsedSouffleOutput,
  parseResults,
  parseResultsSync,
} from "./results";
import { exec, execSync } from "child_process";
import path from "path";
import fs from "fs";

export interface SouffleExecutorParams {
  /** Path to the Soufflé binary. */
  soufflePath?: string;
  /** Temporary directory to store input facts for Soufflé. */
  inputDir?: string;
  /** Temporary directory or path to CSV output from Soufflé. */
  outputDir?: string;
}

/**
 * Encapsulates results of the Soufflé execution.
 */
export type SouffleExecutionResult<FactData> =
  | { success: true; results: ParsedSouffleOutput<FactData> }
  | { success: false; stderr: string };

/**
 * Manages the process of executing Soufflé and parsing its output.
 */
export abstract class Executor<FactData> {
  protected soufflePath: string;
  protected inputDir: string;
  protected outputDir: string;

  constructor({
    soufflePath = "souffle",
    inputDir = "/tmp/misti/souffle",
    outputDir = "/tmp/misti/souffle",
  }: Partial<SouffleExecutorParams> = {}) {
    this.soufflePath = soufflePath;
    this.inputDir = inputDir;
    this.outputDir = outputDir;
  }

  public abstract execute(
    ctx: SouffleContext<FactData>,
  ):
    | SouffleExecutionResult<FactData>
    | Promise<SouffleExecutionResult<FactData>>;

  /**
   * Produces a Soufflé command that returns output in the CSV format.
   */
  protected makeSouffleCommand(ctx: SouffleContext<FactData>): string {
    const inputDirPath = path.join(this.inputDir, ctx.filename);
    return `${this.soufflePath} -F${this.inputDir} -D${this.outputDir} ${inputDirPath}`;
  }
}

export class SyncExecutor<FactData> extends Executor<FactData> {
  /**
   * Executes the Datalog program using the Soufflé engine synchronously.
   * @returns `SouffleExecutionResult` which contains the status of execution.
   */
  public execute(
    ctx: SouffleContext<FactData>,
  ): SouffleExecutionResult<FactData> {
    try {
      fs.mkdirSync(this.inputDir, { recursive: true });
      SouffleEmitter.make<FactData>(ctx, {
        addComments: ctx.addComments,
      }).dumpSync(this.inputDir);
      const cmd = this.makeSouffleCommand(ctx);
      execSync(cmd, { stdio: ["ignore", "ignore", "pipe"] });
      const rawResults = ctx
        .collectOutputNames()
        .reduce((acc, relationName) => {
          const filepath = path.join(this.outputDir, `${relationName}.csv`);
          acc.set(relationName, parseResultsSync(filepath));
          return acc;
        }, new Map<string, RawSouffleOutput>());
      const results = ParsedSouffleOutput.fromRaw(ctx, rawResults);
      return { success: true, results };
    } catch (error) {
      return { success: false, stderr: `${error}` };
    }
  }
}

export class AsyncExecutor<FactData> extends Executor<FactData> {
  /**
   * Executes the Datalog program using the Soufflé engine.
   * @returns `SouffleExecutionResult` which contains the status of execution.
   */
  public async execute(
    ctx: SouffleContext<FactData>,
  ): Promise<SouffleExecutionResult<FactData>> {
    await fs.promises.mkdir(this.inputDir, { recursive: true });
    await SouffleEmitter.make<FactData>(ctx, {
      addComments: ctx.addComments,
    }).dump(this.inputDir);
    const cmd = this.makeSouffleCommand(ctx);
    return new Promise((resolve, reject) => {
      exec(cmd, async (error, _stdout, stderr) => {
        if (error) {
          reject({
            success: false,
            stderr: stderr ? `${error}:\n${stderr}` : `${error}`,
          });
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
                const rawResults = await parseResults(filepath);
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
}
