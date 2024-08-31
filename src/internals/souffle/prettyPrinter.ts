import {
  SouffleNode,
  SouffleComment,
  SouffleRuleBody,
  SouffleConstraint,
  SouffleProgram,
  SouffleFact,
  SouffleRelation,
  SouffleRule,
  SouffleAtom,
} from "./syntax";

/**
 * Pretty-prints Souffle entries.
 */
export class SoufflePrettyPrinter<FactData = undefined> {
  private constructor(private addComments: boolean) {}
  public static make<FactData = undefined>({
    addComments = false,
  }: Partial<{ addComments: boolean }> = {}): SoufflePrettyPrinter<FactData> {
    return new SoufflePrettyPrinter(addComments);
  }

  public prettyPrint(node: SouffleNode<FactData>): string | never {
    switch (node.kind) {
      case "comment":
        return this.ppComment(node);
      case "program":
        return this.ppProgram(node);
      case "fact":
        return this.ppFact(node);
      case "relation":
        return this.ppRelation(node);
      case "rule":
        return this.ppRule(node);
      case "atom":
        return this.ppAtom(node);
      default:
        throw new Error(`Unsupported node: ${JSON.stringify(node)}`);
    }
  }

  private ppComment(comment: SouffleComment): string {
    if (!this.addComments || comment.lines.length === 0) {
      return "";
    }
    return comment.style === "/*"
      ? ["/**", ...comment.lines.map((line) => ` * ${line}`), "*/"].join("\n")
      : comment.lines.map((line) => `// ${line}`).join("\n");
  }

  private ppProgram(program: SouffleProgram<FactData>): string {
    return [
      this.addComments && program.comment && this.ppComment(program.comment),
      ...program.entries.map((e) => this.prettyPrint(e)),
    ]
      .filter((e) => e !== "")
      .filter(Boolean)
      .join("\n");
  }

  private ppFact(fact: SouffleFact<FactData>): string {
    const values = fact.values
      .map((value) => (typeof value === "string" ? `"${value}"` : value))
      .join(", ");
    return `${fact.relationName}(${values}).`;
  }

  private ppRelation(relation: SouffleRelation): string {
    const comment =
      this.addComments && relation.comment
        ? this.ppComment(relation.comment) + "\n"
        : "";
    const args = relation.args
      .map(([name, type]) => `${name}: ${type.toLowerCase()}`)
      .join(", ");
    const io =
      relation.io === undefined
        ? ""
        : relation.io === "input"
          ? `\n.input ${relation.name}`
          : `\n.output ${relation.name}`;
    return `${comment}.decl ${relation.name}(${args})${io}`;
  }

  private ppConstraint(constraint: SouffleConstraint): string {
    switch (constraint.kind) {
      case "binary":
        return `${constraint.lhs} ${constraint.op} ${constraint.rhs}`;
      case "match":
        return `${constraint.lhs} matches ${constraint.rhs}`;
      case "contains":
        return `${constraint.lhs} contains ${constraint.rhs}`;
      case "boolean":
        return `${constraint.value}`;
    }
  }

  private ppRule(rule: SouffleRule): string {
    const comment =
      this.addComments && rule.comment
        ? this.ppComment(rule.comment) + "\n"
        : "";
    const indent = "  ";
    const head = rule.heads.map((head) => this.prettyPrint(head)).join(", ");
    const body = rule.body
      .map((entry: SouffleRuleBody) => {
        const formattedEntry =
          entry.kind === "atom"
            ? this.ppAtom(entry.value)
            : this.ppConstraint(entry.value);
        return entry.negated ? `!(${formattedEntry})` : formattedEntry;
      })
      .join(`,\n${indent}`);
    return `${comment}${head} :-\n${indent}${body}.`;
  }

  private ppAtom(atom: SouffleAtom): string {
    return `${atom.name}(${atom.args.join(", ")})`;
  }
}
