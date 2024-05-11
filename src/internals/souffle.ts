import { exec, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { Transform, TransformCallback } from "stream";

type RelationName = string;
type AttrName = string;

/**
 * An optional IO attribute that adds ".input" or ".output" directive for the relation.
 */
type RelationIO = "input" | "output" | undefined;

export type FactEntry =
  | { kind: "symbol"; value: string }
  | { kind: "number"; value: number }
  | { kind: "unsigned"; value: number }
  | { kind: "float"; value: number };

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

/**
 * Used to avoid adding duplicate facts to the relation.
 */
class FactSet {
  private map = new Map<string, FactEntry["value"][]>();

  private serialize(array: FactEntry["value"][]): string {
    return array.map((item) => `${item}`).join("|");
  }

  public add(array: FactEntry["value"][]): void {
    const key = this.serialize(array);
    if (!this.map.has(key)) {
      this.map.set(key, array);
    }
  }

  public has(array: FactEntry["value"][]): boolean {
    return this.map.has(this.serialize(array));
  }

  public remove(array: FactEntry["value"][]): boolean {
    return this.map.delete(this.serialize(array));
  }

  public values(): IterableIterator<FactEntry["value"][]> {
    return this.map.values();
  }

  public size(): number {
    return this.map.size;
  }
}

/**
 * Represents a Soufflé relation with its facts and declarations.
 */
export class Relation {
  /**
   * @param name The name of the relation.
   * @param args An array of tuples specifying the attribute name and its type.
   * @param io Optional directive specifying if the relation is an input or output relation.
   * @param facts An optional array of initial facts for the relation.
   */
  constructor(
    public name: RelationName,
    public args: [AttrName, FactEntry["kind"]][],
    public io: RelationIO = undefined,
    public facts: FactSet = new FactSet(),
  ) {}

  /**
   * Adds a fact to the relation, validating argument count.
   */
  public addFact(fact: FactEntry["value"][]) {
    if (fact.length !== this.args.length) {
      throw new Error(
        `incorrect number of arguments for ${this.name}: got ${fact.length} expected ${this.args.length}`,
      );
    }
    this.facts.add(fact);
  }

  /**
   * Outputs the declaration of the relation in Soufflé Datalog syntax.
   */
  public emitDecl(): string {
    const argsFormatted = this.args
      .map(([name, type]) => `${name}:${type}`)
      .join(", ");
    const io =
      this.io === undefined
        ? ``
        : this.io === "input"
          ? `\n.input ${this.name}`
          : `\n.output ${this.name}`;
    return `.decl ${this.name}(${argsFormatted})${io}`;
  }

  /**
   * Outputs the facts of the relation in Soufflé Datalog syntax.
   */
  public emitFacts(): string {
    return Array.from(this.facts.values())
      .reduce((result, fact) => {
        const factFormatted = fact
          .map((factEntry) =>
            typeof factEntry === "string" ? `"${factEntry}"` : factEntry,
          )
          .join(", ");
        result.push(`${this.name}(${factFormatted}).`);
        return result;
      }, [])
      .join("\n");
  }
}

/**
 * Represents an atom of a Soufflé rule: https://souffle-lang.github.io/rules#atom
 */
export type RuleAtom = {
  name: string;
  arguments: string[];
};

/**
 * Head of the rule: https://souffle-lang.github.io/rules#multiple-heads.
 */
export type RuleHead = RuleAtom[];

/**
 * Body of a rule which is present as a conjunction of (negated) atoms/constraints/disjunctions:
 * https://souffle-lang.github.io/rules#conjunction.
 */
export type RuleBodyEntry = { kind: "atom"; value: RuleAtom; negated: boolean };

/**
 * Represents a single Datalog rule in a Souffle program.
 */
export class Rule {
  public heads: RuleHead;
  public body: RuleBodyEntry[];

  /**
   * Constructs a Datalog rule with the given heads and body entries.
   * See: https://souffle-lang.github.io/rules for more information.
   * @param head Heads of the rule.
   * @param bodyEntries Entries that represent a body of a rule.
   */
  constructor(heads: RuleHead, ...bodyEntries: RuleBodyEntry[]) {
    this.heads = heads;
    this.body = bodyEntries;
  }

  /**
   * Emits the Datalog rule as a string suitable for inclusion in a Souffle program.
   * @returns The formatted Datalog rule.
   */
  public emit(): string {
    const formatAtom = (atom: RuleAtom) =>
      `${atom.name}(${atom.arguments.join(", ")})`;
    const formatHead = (heads: RuleHead) =>
      heads.map((head) => formatAtom(head)).join(", ");
    const formatBodyEntry = (entry: RuleBodyEntry) =>
      `${entry.negated ? "!" : ""}${formatAtom(entry.value)}`;
    const headsStr = formatHead(this.heads);
    const bodyStr = this.body.map(formatBodyEntry).join(", ");
    return `${headsStr} :-\n    ${bodyStr}.`;
  }
}

/**
 * Manages multiple Soufflé relations.
 */
export class SouffleProgram {
  /**
   * A map to hold declarations of relations.
   */
  private relations = new Map<RelationName, Relation>();

  /**
   * Soufflé rules defined in the program.
   */
  private rules: Rule[] = [];

  /**
   * @param name Unique name of this program.
   */
  constructor(private name: string) {}

  /**
   * Filename of the Soufflé file generated from this program.
   */
  get filename(): string {
    return `${this.name}.dl`;
  }

  /**
   * Collects names of relations which produce output on executing.
   */
  collectOutputNames(): string[] {
    return Array.from(this.relations.entries()).reduce(
      (outputNames, [_, relation]) => {
        if (relation.io === "output") {
          outputNames.push(relation.name);
        }
        return outputNames;
      },
      [] as string[],
    );
  }

  /**
   * Adds a new relation to the context.
   * @param name The unique name of the relation.
   * @param args A list of tuples specifying the name and type of each attribute in the relation.
   * Throws an error if a relation with the same name is already defined.
   */
  public addRelation(
    name: RelationName,
    io: RelationIO,
    ...args: [AttrName, FactEntry["kind"]][]
  ) {
    if (this.relations.has(name)) {
      throw new Error(`relation ${name} is already declared`);
    }
    const decl = new Relation(name, args, io);
    this.relations.set(name, decl);
  }

  /**
   * Adds a new fact to an existing relation.
   * @param name The name of the relation to which the fact will be added.
   * @param args The values representing the fact, corresponding to the relation's arguments.
   * @throws Error if the relation does not exist.
   */
  public addFact(name: RelationName, ...args: FactEntry["value"][]) {
    const relation = this.relations.get(name);
    if (!relation) {
      throw new Error(`unknown relation: ${name}`);
    }
    relation.addFact(args);
  }

  /**
   * Adds a new rule to the Souffle program.
   * @param rule The rule to add to the program.
   * @throws Error if any head relation is not defined.
   */
  public addRule(rule: Rule) {
    const undefinedRelations = rule.heads
      .filter((head) => !this.relations.has(head.name))
      .map((head) => head.name);
    if (undefinedRelations.length > 0) {
      throw new Error(
        `Undefined relations in the \`${rule}\` rule: ${undefinedRelations.join(", ")}\nPlease add them using \`addRelation\`.`,
      );
    }
    this.rules.push(rule);
  }

  /**
   * Outputs the available rules as a Soufflé program.
   */
  private emitRules(): string {
    return this.rules.map((rule) => rule.emit()).join("\n");
  }

  public emit(): string {
    const relationsStr = Array.from(this.relations)
      .reduce((result, [_name, relation]) => {
        result.push(relation.emitDecl());
        result.push(relation.emitFacts());
        if (relation.facts.size() > 0) {
          result.push(" ");
        }
        return result;
      }, [] as string[])
      .join("\n");
    return `${relationsStr}\n${this.emitRules()}`;
  }

  /**
   * Asynchronously dumps the generated Soufflé program and facts to a single file within the specified directory.
   * @param dir The directory where the Soufflé fact files should be written.
   */
  public async dump(dir: string): Promise<void> {
    const programPath = path.join(dir, this.filename);
    await fs.promises.writeFile(programPath, this.emit(), "utf8");
  }

  /**
   * Synchronously dumps the generated Soufflé program and facts to a single file within the specified directory.
   * @param dir The directory where the Soufflé fact files should be written.
   */
  public dumpSync(dir: string): void {
    const programPath = path.join(dir, this.filename);
    fs.writeFileSync(programPath, this.emit(), "utf8");
  }
}

export interface SouffleExecutorParameters {
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
export class SouffleExecutor {
  private soufflePath: string;
  private inputDir: string;
  private outputDir: string;

  constructor(params: Partial<SouffleExecutorParameters> = {}) {
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
  private makeSouffleCommand(program: SouffleProgram): string {
    const programPath = path.join(this.inputDir, program.filename);
    return `${this.soufflePath} -F${this.inputDir} -D${this.outputDir} ${programPath}`;
  }

  /**
   * Executes the Datalog program using the Soufflé engine.
   * @returns `SouffleExecutionResult` which contains the status of execution.
   */
  public async execute(
    program: SouffleProgram,
  ): Promise<SouffleExecutionResult> {
    await fs.promises.mkdir(this.inputDir, { recursive: true });
    await program.dump(this.inputDir);
    const cmd = this.makeSouffleCommand(program);
    return new Promise((resolve, reject) => {
      exec(cmd, async (error, _, stderr) => {
        if (error) {
          reject(new SouffleExecutionResult(false, `${error}`));
        } else if (stderr) {
          reject(new SouffleExecutionResult(false, `${stderr}`));
        } else {
          try {
            const results = await program
              .collectOutputNames()
              .reduce(async (accPromise, relationName) => {
                const acc = await accPromise;
                const filepath = path.join(
                  this.outputDir,
                  `${relationName}.csv`,
                );
                const results = await this.parseResults(filepath);
                acc.set(relationName, results);
                return acc;
              }, Promise.resolve(new Map<string, RawSouffleOutput>()));
            resolve(new SouffleExecutionResult(true, "", results));
          } catch (parseError) {
            reject(new SouffleExecutionResult(false, `${parseError}`));
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
  public executeSync(program: SouffleProgram): SouffleExecutionResult {
    try {
      fs.mkdirSync(this.inputDir, { recursive: true });
      program.dumpSync(this.inputDir);
      const cmd = this.makeSouffleCommand(program);
      execSync(cmd, { stdio: ["ignore", "ignore", "pipe"] });
      const results = program
        .collectOutputNames()
        .reduce((acc, relationName) => {
          const filepath = path.join(this.outputDir, `${relationName}.csv`);
          const results = this.parseResultsSync(filepath);
          acc.set(relationName, results);
          return acc;
        }, new Map<string, RawSouffleOutput>());
      return new SouffleExecutionResult(true, "", results);
    } catch (error) {
      return new SouffleExecutionResult(false, `${error}`);
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
  parseSpaceSeparatedValues(input: string) {
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

type RawSouffleOutput = string[][];

/**
 * Encapsulates results of the Soufflé execution.
 */
export class SouffleExecutionResult {
  constructor(
    public success: boolean,
    public stderr: string = "",
    public results: Map<string, RawSouffleOutput> = new Map(),
  ) {}
}
