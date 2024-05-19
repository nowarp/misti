import { FactType } from ".";

export type RelationName = string;
export type RelationArgName = string;

/**
 * An optional IO attribute that adds ".input" or ".output" directive for the relation.
 */
export type RelationIO = "input" | "output" | undefined;

/**
 * Represents declaration of a Soufflé relation.
 */
export class Relation {
  /**
   * @param name The name of the relation.
   * @param args An array of tuples specifying the attribute name and its type.
   * @param io Optional directive specifying if the relation is an input or output relation.
   */
  private constructor(
    public name: RelationName,
    public args: [RelationArgName, FactType][],
    public io: RelationIO = undefined,
  ) {}

  static from(
    name: RelationName,
    args: [RelationArgName, FactType][],
    io: RelationIO = undefined,
  ): Relation {
    return new Relation(name, args, io);
  }

  /**
   * Outputs the declaration of the relation in Soufflé Datalog syntax.
   */
  public emitDecl(): string {
    const argsFormatted = this.args
      .map(([name, type]) => `${name}: ${type.toLowerCase()}`)
      .join(", ");
    const io =
      this.io === undefined
        ? ``
        : this.io === "input"
          ? `\n.input ${this.name}`
          : `\n.output ${this.name}`;
    return `.decl ${this.name}(${argsFormatted})${io}`;
  }
}
