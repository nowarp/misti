export type RuleName = string;

/**
 * Represents an atom of a Soufflé rule: https://souffle-lang.github.io/rules#atom
 */
export class Atom {
  public name: RuleName;
  public args: string[];

  constructor(name: RuleName, args: string[] = []) {
    this.name = name;
    this.args = args;
  }

  static from(name: RuleName, args: string[] = []): Atom {
    return new Atom(name, args);
  }
}

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
export class RuleBody {
  public value: Atom;
  public negated: boolean;

  private constructor(value: Atom, params: Partial<RuleBodyParams> = {}) {
    const { negated = false } = params;
    this.value = value!;
    this.negated = negated;
  }

  static from(value: Atom, params: Partial<RuleBodyParams> = {}): RuleBody {
    return new RuleBody(value, params);
  }
}

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
    const formatBodyEntry = (entry: RuleBody) =>
      `${entry.negated ? "!" : ""}${formatAtom(entry.value)}`;
    const headsStr = formatHead(this.heads);
    const bodyStr = this.body.map(formatBodyEntry).join(`,\n${indent}`);
    return `${headsStr} :-\n${indent}${bodyStr}.`;
  }
}
