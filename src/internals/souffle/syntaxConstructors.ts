import {
  SouffleComment,
  SouffleFact,
  SouffleFactValue,
  SouffleRuleBody,
  SouffleProgramEntry,
  SouffleProgram,
  SouffleRelationIO,
  SouffleConstraintArg,
  SouffleConstraint,
  SouffleConstraintOp,
  SouffleRelation,
  SouffleFactType,
  SouffleRule,
  SouffleAtom,
} from "./syntax";

export function comment(
  line: string | string[],
  style: "//" | "/*" = "//",
): SouffleComment {
  return {
    kind: "comment",
    style,
    lines: Array.isArray(line) ? line : [line],
  };
}

export function fact<D = undefined>(
  relationName: string,
  values: SouffleFactValue[],
  data?: D,
): SouffleFact<D> {
  return {
    kind: "fact",
    relationName,
    values,
    data,
  };
}

export function relation(
  name: string,
  args: [string, SouffleFactType][],
  io: SouffleRelationIO | undefined,
  comment?: SouffleComment,
): SouffleRelation {
  return {
    kind: "relation",
    name,
    comment,
    args,
    io,
  };
}

export function atom(name: string, args: string[] = []): SouffleAtom {
  return { kind: "atom", name, args };
}

export function binaryConstraint(
  lhs: SouffleConstraintArg,
  op: SouffleConstraintOp,
  rhs: SouffleConstraintArg,
): SouffleConstraint {
  return {
    kind: "binary",
    lhs,
    op,
    rhs,
  };
}

export function matchConstraint(
  lhs: SouffleConstraintArg,
  rhs: SouffleConstraintArg,
): SouffleConstraint {
  return {
    kind: "match",
    lhs,
    rhs,
  };
}

export function containsConstraint(
  lhs: SouffleConstraintArg,
  rhs: SouffleConstraintArg,
): SouffleConstraint {
  return {
    kind: "contains",
    lhs,
    rhs,
  };
}

export function booleanConstraint(value: boolean): SouffleConstraint {
  return {
    kind: "boolean",
    value,
  };
}

export function body(
  value: SouffleAtom | SouffleConstraint,
  { negated = false }: Partial<{ negated: boolean }> = {},
): SouffleRuleBody {
  const isAtom = (
    value: SouffleAtom | SouffleConstraint,
  ): value is SouffleAtom => "name" in value;
  if (isAtom(value)) {
    return { kind: "atom", value, negated };
  } else {
    return { kind: "constraint", value, negated };
  }
}

export function rule(
  heads: SouffleAtom[],
  body: SouffleRuleBody[],
  comment?: SouffleComment,
): SouffleRule {
  return {
    kind: "rule",
    heads,
    body,
    comment,
  };
}

export function program<D = undefined>(
  name: string,
  entries: SouffleProgramEntry<D>[],
  comment?: SouffleComment,
): SouffleProgram<D> {
  return {
    kind: "program",
    name,
    comment,
    entries,
  };
}
