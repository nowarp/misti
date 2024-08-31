import path from "path";
import fs from "fs";

import { RelationName, Relation, Fact, FactValue, Rule } from ".";

/**
 * Manages multiple Soufflé relations.
 *
 * FactData is an optional annotation of facts that holds some information about their meanings.
 * For example, it could be used to map some program entities with generated Soufflé facts.
 */
export class Context<FactData> {
  /**
   * Holds facts mapped to their corresponding relation declarations.
   */
  private facts = new Map<RelationName, Set<Fact<FactValue, FactData>>>();

  /**
   * Holds declarations of relations.
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
   * Finds a rule which has the given name among its heads.
   */
  public findRule(name: string): Rule | undefined {
    return this.rules.find(
      (r) => r.heads.find((h) => h.name == name) !== undefined,
    );
  }

  /**
   * Finds a relation defined within the program.
   */
  public getRelation(name: RelationName): Relation | undefined {
    return this.relations.get(name);
  }

  /**
   * Finds the fact defined with the given values.
   * @returns FactData if found, `undefined` otherwise.
   */
  public findFact(values: FactValue[]): Fact<FactValue, FactData> | undefined {
    for (const [_relationName, facts] of this.facts) {
      const fact = Array.from(facts).find((fact) => fact.eqValues(values));
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
  public add(entity: Relation | Rule) {
    if (entity instanceof Relation) {
      this.addRelation(entity);
    } else if (entity instanceof Rule) {
      this.addRule(entity);
    } else {
      throw new Error(`Cannot add unsupported entity: ${entity}`);
    }
  }

  /**
   * Adds a new relation to the Soufflé program.
   * @throws If a relation with the same name is already defined.
   */
  private addRelation(relation: Relation) {
    if (this.relations.has(relation.name)) {
      throw new Error(`Relation ${relation.name} is already declared`);
    }
    this.relations.set(relation.name, relation);
  }

  /**
   * Adds a new fact to an existing relation.
   * @param name The name of the relation to which the fact is related.
   * @param fact Fact values to add.
   * @throws Error if the relation does not exist.
   */
  public addFact<T extends FactValue>(
    name: RelationName,
    fact: Fact<T, FactData>,
  ) {
    const relation = this.relations.get(name);
    if (!relation) {
      throw new Error(`Unknown relation: ${name}`);
    }

    // Sanity check: compare number of arguments in the declaration and the actual ones.
    if (fact.values.length !== relation.args.length) {
      throw new Error(
        `Incorrect number of arguments for ${this.name}: got ${fact.values.length} expected ${relation.args.length}`,
      );
    }

    this.facts.set(
      name,
      (this.facts.get(name) || new Set<Fact<FactValue, FactData>>()).add(fact),
    );
  }

  /**
   * Adds a new rule to the Soufflé program.
   * @param rule The rule to add to the program.
   * @throws Error if any head relation is not defined.
   */
  private addRule(rule: Rule) {
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
   * Outputs the facts of the relation in Soufflé Datalog syntax.
   * @returns Datalog definition of the facts or `undefined` if there are no facts for that relation.
   */
  public emitFacts(name: RelationName): string | undefined {
    const fact = this.facts.get(name);
    if (fact === undefined) {
      return undefined;
    }
    return Array.from(fact.values())
      .reduce((result, entry) => {
        const factFormatted = entry.values
          .map((fact) => (typeof fact === "string" ? `"${fact}"` : fact))
          .join(", ");
        result.push(`${name}(${factFormatted}).`);
        return result;
      }, [] as string[])
      .join("\n");
  }

  /**
   * Outputs the defined relation declarations and facts as a Soufflé program.
   */
  private emitRelations(): string {
    return Array.from(this.relations)
      .reduce((result, [_name, relation]) => {
        result.push(relation.emitDecl());
        const facts = this.emitFacts(relation.name);
        if (facts !== undefined) {
          result.push(facts);
          result.push(" ");
        }
        return result;
      }, [] as string[])
      .join("\n");
  }

  /**
   * Outputs the defined rules as a Soufflé program.
   */
  private emitRules(): string {
    return this.rules.map((rule) => rule.emit()).join("\n");
  }

  public emit(): string {
    return `${this.emitRelations()}\n${this.emitRules()}`;
  }

  /**
   * Asynchronously dumps the generated Soufflé program and facts to a single file within the specified directory.
   * @param dir The directory where the Soufflé fact files should be written.
   */
  public async dump(dir: string): Promise<void> {
    const programPath = path.join(dir, this.filename);
    const data = this.emit();
    await fs.promises.writeFile(programPath, data, "utf8");
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
