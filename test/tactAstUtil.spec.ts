import { removeSelf } from "../src/internals/tactASTUtil";
import {
  AstExpression,
  AstId,
  AstFieldAccess,
} from "@tact-lang/compiler/dist/grammar/ast";
import { dummySrcInfo } from "@tact-lang/compiler/dist/grammar/grammar";

let idCounter = 0;
function nextId(): number {
  return idCounter++;
}

describe("removeSelf Function Tests", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  test("removes self from self.a", () => {
    // 'self.a'
    const expr: AstExpression = {
      kind: "field_access",
      aggregate: {
        kind: "id",
        text: "self",
        id: nextId(),
        loc: dummySrcInfo,
      },
      field: {
        kind: "id",
        text: "a",
        id: nextId(),
        loc: dummySrcInfo,
      },
      id: nextId(),
      loc: dummySrcInfo,
    };

    // AstId('a')
    const expected: AstId = {
      kind: "id",
      text: "a",
      id: expr.field.id,
      loc: expr.field.loc,
    };

    const result = removeSelf(expr);
    expect(result).toEqual(expected);
  });

  test("removes self from self.object.f1", () => {
    // 'self.object.f1'
    const expr: AstExpression = {
      kind: "field_access",
      aggregate: {
        kind: "field_access",
        aggregate: {
          kind: "id",
          text: "self",
          id: nextId(),
          loc: dummySrcInfo,
        },
        field: {
          kind: "id",
          text: "object",
          id: nextId(),
          loc: dummySrcInfo,
        },
        id: nextId(),
        loc: dummySrcInfo,
      },
      field: {
        kind: "id",
        text: "f1",
        id: nextId(),
        loc: dummySrcInfo,
      },
      id: nextId(),
      loc: dummySrcInfo,
    };

    // AstFieldAccess('object', 'f1')
    const aggregateFA = expr.aggregate as AstFieldAccess;
    const expected: AstFieldAccess = {
      kind: "field_access",
      aggregate: {
        kind: "id",
        text: "object",
        id: aggregateFA.field.id,
        loc: aggregateFA.field.loc,
      },
      field: {
        kind: "id",
        text: "f1",
        id: expr.field.id,
        loc: expr.field.loc,
      },
      id: expr.id,
      loc: expr.loc,
    };

    const result = removeSelf(expr);
    expect(result).toEqual(expected);
  });

  test("returns undefined for nonSelf.a", () => {
    // 'nonSelf.a'
    const expr: AstExpression = {
      kind: "field_access",
      aggregate: {
        kind: "id",
        text: "nonSelf",
        id: nextId(),
        loc: dummySrcInfo,
      },
      field: {
        kind: "id",
        text: "a",
        id: nextId(),
        loc: dummySrcInfo,
      },
      id: nextId(),
      loc: dummySrcInfo,
    };

    const result = removeSelf(expr);
    expect(result).toBeUndefined();
  });
});
