export type RuleName = string;

/**
 * Represents an atom of a Soufflé rule: https://souffle-lang.github.io/rules#atom
 */
export type Atom = {
  name: RuleName;
  args: string[];
};

export const makeAtom = (name: RuleName, args: string[] = []): Atom => {
  return { name, args };
};

/**
 * A predicate used in rules to produce boolean values: https://souffle-lang.github.io/constraints
 */
export type Constraint =
  | { kind: "binary"; lhs: ConstraintArg; op: ConstraintOp; rhs: ConstraintArg }
  | { kind: "match"; lhs: ConstraintArg; rhs: ConstraintArg }
  | { kind: "contains"; lhs: ConstraintArg; rhs: ConstraintArg }
  | { kind: "boolean"; value: boolean };
export type ConstraintOp = "<" | ">" | "<=" | ">=" | "=" | "!=";
export type ConstraintArg = string | number;

export const makeBinConstraint = (
  lhs: ConstraintArg,
  op: ConstraintOp,
  rhs: ConstraintArg,
): Constraint => {
  return { kind: "binary", lhs, op, rhs };
};
export const makeMatchConstraint = (
  lhs: ConstraintArg,
  rhs: ConstraintArg,
): Constraint => {
  return { kind: "match", lhs, rhs };
};
export const makeConstainsConstraint = (
  lhs: ConstraintArg,
  rhs: ConstraintArg,
): Constraint => {
  return { kind: "contains", lhs, rhs };
};
export const makeBooleanConstraint = (value: boolean): Constraint => {
  return { kind: "boolean", value };
};

/**
 * Head of the rule: https://souffle-lang.github.io/rules#multiple-heads.
 */
export type RuleHead = Atom[];

type RuleBodyParams = {
  negated?: boolean;
};

/**
 * Body of a rule which is present as a conjunction of (negated) atoms/constraints/disjunctions:
 * https://souffle-lang.github.io/rules#conjunction.
 */
export type RuleBody =
  | { kind: "atom"; value: Atom; negated: boolean }
  | { kind: "constraint"; value: Constraint; negated: boolean };

export const makeRuleBody = (
  value: Atom | Constraint,
  params: Partial<{ negated: boolean }> = {},
): RuleBody => {
  const { negated = false } = params;
  if (isAtom(value)) {
    return { kind: "atom", value, negated };
  } else {
    return { kind: "constraint", value, negated };
  }
};

const isAtom = (value: Atom | Constraint): value is Atom => {
  return (value as Atom).name !== undefined;
};

/**
 * Represents a single Datalog rule in a Souffle program.
 */
export class Rule {
  public heads: RuleHead;
  public body: RuleBody[];

  /**
   * Constructs a Datalog rule with the given heads and body entries.
   * See: https://souffle-lang.github.io/rules for more information.
   * @param head Heads of the rule.
   * @param bodyEntries Entries that represent a body of a rule.
   */
  private constructor(heads: RuleHead, ...bodyEntries: RuleBody[]) {
    this.heads = heads;
    this.body = bodyEntries;
  }

  static from(heads: RuleHead, ...bodyEntries: RuleBody[]): Rule {
    return new Rule(heads, ...bodyEntries);
  }

  /**
   * Emits the Datalog rule as a string suitable for inclusion in a Souffle program.
   * @returns The formatted Datalog rule.
   */
  public emit(): string {
    const indent = "  ";
    const formatAtom = (atom: Atom) => `${atom.name}(${atom.args.join(", ")})`;
    const formatHead = (heads: RuleHead) =>
      heads.map((head) => formatAtom(head)).join(", ");
    const formatConstraint = (constraint: Constraint) => {
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
    };
    const formatBodyEntry = (entry: RuleBody) => {
      const formattedEntry =
        entry.kind === "atom"
          ? formatAtom(entry.value)
          : formatConstraint(entry.value);
      return entry.negated ? `!(${formattedEntry})` : formattedEntry;
    };
    const headsStr = formatHead(this.heads);
    const bodyStr = this.body.map(formatBodyEntry).join(`,\n${indent}`);
    return `${headsStr} :-\n${indent}${bodyStr}.`;
  }
}
