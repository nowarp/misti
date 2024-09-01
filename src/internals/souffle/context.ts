import {
  SouffleRelation,
  SouffleFact,
  SouffleFactValue,
  SouffleProgramEntry,
  SouffleRule,
  SouffleComment,
  SouffleProgram,
} from "./syntax";
import { SouffleUsageError } from "./errors";
import { ILogger, DefaultLogger } from "./logger";
import { eqFactValues } from "./syntaxUtils";
import { program, fact } from "./syntaxConstructors";

type RelationName = string;

/**
 * Program generation context that maps relations, facts, and rules, and generates
 * a valid AST, suitable for pretty-printing and further processing by `souffle`.
 *
 * `FactData` is an optional annotation of facts that holds some information about
 * their meanings. For example, it could be used to map some program entities with
 * generated Soufflé facts.
 */
export class SouffleContext<FactData = undefined> {
  /**
   * Docstring-like comment introduced to the top level of the generated program.
   */
  private programComment: SouffleComment | undefined;

  /**
   * Add generated comments to the output Soufflé program.
   * Set to `false` to reduce the size of produced code.
   */
  public addComments: boolean;

  /**
   * Logger used to report library messages.
   */
  public logger: ILogger;

  /**
   * Holds facts mapped to their corresponding relation declarations.
   */
  private facts = new Map<RelationName, Set<SouffleFact<FactData>>>();

  /**
   * Holds declarations of relations.
   */
  private relations = new Map<RelationName, SouffleRelation>();

  /**
   * Soufflé rules defined in the program.
   */
  private rules: SouffleRule[] = [];

  /**
   * @param name Unique name of the generated program.
   * @param comment Docstring-like comment to be added on the top of the generated program.
   * @param addComments Include comments to the generated program.
   */
  constructor(
    private name: string,
    {
      comment = undefined,
      addComments = false,
      logger = new DefaultLogger(),
    }: Partial<{
      comment: SouffleComment | undefined;
      addComments: boolean;
      formatWithSpacing: boolean;
      logger: ILogger;
    }> = {},
  ) {
    this.programComment = comment;
    this.addComments = addComments;
    this.logger = logger;
  }

  /** Filename of the Soufflé file to be used for the generated program. */
  get filename(): string {
    return `${this.name}.dl`;
  }

  /**
   * Generates Soufflé program based on the relations, rules and facts added to the context.
   */
  public generateProgram(): SouffleProgram<FactData> {
    const relationsWithFacts = Array.from(this.relations.keys()).reduce(
      (acc, relationName) => {
        const decl = this.relations.get(relationName)!;
        const facts =
          this.facts.get(relationName) || new Set<SouffleFact<FactData>>();
        return acc.concat([decl, ...facts]);
      },
      [] as SouffleProgramEntry<FactData>[],
    );
    const entries = [...relationsWithFacts, ...this.rules];
    return program<FactData>(this.name, entries, this.programComment);
  }

  /**
   * Finds a rule which has the given name among its heads.
   */
  public findRule(name: string): SouffleRule | undefined {
    return this.rules.find(
      (r) => r.heads.find((h) => h.name == name) !== undefined,
    );
  }

  /**
   * Finds a relation defined within the program.
   */
  public getRelation(name: RelationName): SouffleRelation | undefined {
    return this.relations.get(name);
  }

  /**
   * Finds the fact defined with the given values.
   * @returns FactData if found, `undefined` otherwise.
   */
  public findFact(
    values: SouffleFactValue[],
  ): SouffleFact<FactData> | undefined {
    for (const [_relationName, facts] of this.facts) {
      const fact = Array.from(facts).find((fact) =>
        eqFactValues(fact.values, values),
      );
      if (fact !== undefined) {
        return fact;
      }
    }
    return undefined;
  }

  /**
   * Collects names of relations which produce output on executing.
   */
  public collectOutputNames(): string[] {
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
   * Adds new entities to the Soufflé program.
   * @throws If an entity is already defined.
   */
  public add(entity: SouffleRelation | SouffleRule) {
    if (entity.kind === "relation") {
      this.addRelation(entity);
    } else if (entity.kind === "rule") {
      this.addRule(entity);
    } else {
      throw SouffleUsageError.make(`Cannot add unsupported entity: ${entity}`);
    }
  }

  /**
   * Adds a new relation to the Soufflé program.
   * @throws If a relation with the same name is already defined.
   */
  private addRelation(relation: SouffleRelation): void | never {
    if (this.relations.has(relation.name)) {
      throw SouffleUsageError.make(
        `Relation ${relation.name} is already declared`,
      );
    }
    this.relations.set(relation.name, relation);
  }

  /**
   * Adds a new fact to an existing relation.
   * @param name The name of the relation to which the fact is related.
   * @param fact Fact values to add.
   * @throws Error if the relation does not exist.
   */
  public addFact(
    name: RelationName,
    factValues: SouffleFactValue[],
    data?: FactData,
  ): void | never {
    const relation = this.relations.get(name);
    if (!relation) {
      throw SouffleUsageError.make(`Unknown relation: ${name}`);
    }

    // Sanity check: compare number of arguments in the declaration and the actual ones.
    if (factValues.length !== relation.args.length) {
      throw SouffleUsageError.make(
        `Incorrect number of arguments for ${this.name}: got ${factValues.length} expected ${relation.args.length}`,
      );
    }

    const newFact = fact<FactData>(name, factValues, data);
    this.facts.set(
      name,
      (this.facts.get(name) || new Set<SouffleFact<FactData>>()).add(newFact),
    );
  }

  /**
   * Adds a new rule to the Soufflé program.
   * @param rule The rule to add to the program.
   * @throws Error if any head relation is not defined.
   */
  private addRule(rule: SouffleRule) {
    const undefinedRelations = rule.heads
      .filter((head) => !this.relations.has(head.name))
      .map((head) => head.name);
    if (undefinedRelations.length > 0) {
      throw SouffleUsageError.make(
        `Undefined relations in the \`${rule}\` rule: ${undefinedRelations.join(", ")}\nPlease add them using \`addRelation\`.`,
      );
    }
    this.rules.push(rule);
  }
}
