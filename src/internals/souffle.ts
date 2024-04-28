import { exec } from "child_process";
import path from "path";
import { promises as fs } from "fs";

type RelationName = string;
type AttrName = string;

export type FactEntry =
  | { kind: "symbol"; value: string }
  | { kind: "number"; value: number }
  | { kind: "unsigned"; value: number }
  | { kind: "float"; value: number };

/**
 * Represents a Soufflé relation with its facts and declarations.
 */
export class Relation {
  constructor(
    public name: RelationName,
    public args: [AttrName, FactEntry["kind"]][],
    public facts: FactEntry["value"][][] = [],
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
    this.facts.push(fact);
  }

  /**
   * Outputs the relation and its facts in Soufflé Datalog syntax.
   */
  public emit(): string {
    let result: string[] = [];

    // Format declaration
    const argsFormatted = this.args
      .map(([name, type]) => `${name}:${type}`)
      .join(", ");
    result.push(`.decl ${this.name}(${argsFormatted})`);

    // Format facts
    for (const fact of this.facts) {
      const factFormatted = fact.join(", ");
      result.push(`${this.name}(${factFormatted}).`);
    }

    return result.join("\n");
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
   * Adds a new relation to the context.
   * @param name The unique name of the relation.
   * @param args A list of tuples specifying the name and type of each attribute in the relation.
   * Throws an error if a relation with the same name is already defined.
   */
  public addRelation(
    name: RelationName,
    ...args: [AttrName, FactEntry["kind"]][]
  ) {
    if (this.relations.has(name)) {
      throw new Error(`relation ${name} is already declared`);
    }
    const decl = new Relation(name, args);
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
   * Compiles all relation declarations and their facts into a single Soufflé Datalog program.
   * @returns A string containing the formatted Datalog program.
   */
  public emit(): string {
    let result: string[] = [];
    for (const [_, relation] of this.relations.entries()) {
      result.push(relation.emit());
    }
    return result.join("\n");
  }

  /**
   * Dumps the generated Soufflé program facts to separate files within a specified directory.
   * @param dir The directory where the Soufflé fact files should be written.
   */
  public async dump(dir: string): Promise<void> {
    for (const [name, relation] of this.relations.entries()) {
      const filePath = path.join(dir, `${name}.facts`);
      const facts = relation.facts.map((fact) => fact.join(",")).join("\n");
      await fs.writeFile(filePath, facts, "utf8");
    }
  }
}

const STDOUT_OUTPUT = "-";

/**
 * Manages Soufflé execution context.
 */
export class SouffleExecutor {
  /**
   * @param soufflePath Path to the Soufflé executable.
   * @param factDir Directory to store input facts for Soufflé.
   * @param outputDir Directory or path to output results from Soufflé.
   */
  constructor(
    private soufflePath: string = "souffle",
    private factDir: string = "/tmp/misti/souffle",
    private outputDir: string = STDOUT_OUTPUT,
  ) {}

  /**
   * Executes the Datalog program using the Soufflé engine.
   * @returns `true` if the command executes without errors, otherwise `false`.
   */
  public async execute(program: SouffleProgram): Promise<boolean> {
    program.dump(this.factDir);
    const cmd = `${this.soufflePath} -F${this.factDir} -D${this.outputDir}`;
    return new Promise((resolve, _) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error("Error executing Soufflé:", error);
          resolve(false);
        }
        if (stderr) {
          console.error("Soufflé Execution Errors:", stderr);
          resolve(false);
        } else {
          console.log("Soufflé Execution Output:", stdout);
          resolve(true);
        }
      });
    });
  }
}
