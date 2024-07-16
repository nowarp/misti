import {
  Relation,
  Rule,
  Fact,
  makeRuleBody,
  FactType,
  makeAtom,
  Context,
} from "../src/internals/souffle";
import fs from "fs";
import path from "path";

jest.mock("fs", () => {
  const originalFs = jest.requireActual("fs");
  return {
    ...originalFs,
    promises: {
      writeFile: jest.fn(),
      mkdir: jest.fn(() => Promise.resolve()),
    },
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue("name x\nresult  42\n"),
    createReadStream: jest.fn().mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Readable = require("stream").Readable;
      const mockStream = new Readable();
      mockStream.push("name x\nresult  42\n");
      mockStream.push(null); // end of stream
      return mockStream;
    }),
  };
});

jest.mock("child_process", () => {
  const exec = jest.fn((_cmd, callback) => {
    callback(null, "Execution complete", "");
  });
  const execSync = jest.fn(() => "Execution complete");
  return { exec, execSync };
});

describe("Souffle Datalog tests", () => {
  const factDir = "/tmp/misti/souffle";
  describe("Relation class", () => {
    it("should add facts correctly and emit Datalog syntax", () => {
      const relation = Relation.from("TestRelation", [["x", FactType.Number]]);
      expect(relation.emitDecl()).toContain(".decl TestRelation(x: number)");
    });
  });

  describe("Context class", () => {
    let ctx: Context<any>;

    beforeEach(() => {
      ctx = new Context("test");
      ctx.add(Relation.from("TestRelation", [["x", FactType.Number]]));
    });

    it("should compile and dump the facts correctly", async () => {
      ctx.addFact("TestRelation", Fact.from([42]));
      await ctx.dump(factDir);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join(factDir, "test.dl"),
        expect.any(String),
        "utf8",
      );
    });

    it("should compile and emit the rules correctly", () => {
      ctx.add(Relation.from("out", [["x", FactType.Number]], "output"));
      ctx.add(
        Rule.from(
          [makeAtom("out", ["x"])],
          makeRuleBody(makeAtom("TestRelation", ["x"])),
        ),
      );
      const output = ctx.emit();
      expect(output).toContain(".decl TestRelation(x: number)");
      expect(output).toContain("out(x) :-\n  TestRelation(x).");
    });

    it("should handle rules and relations properly when dumped", async () => {
      ctx.add(Relation.from("out", [["x", FactType.Number]], "output"));
      ctx.add(
        Rule.from(
          [makeAtom("out", ["x"])],
          makeRuleBody(makeAtom("TestRelation", ["x"])),
        ),
      );
      await ctx.dump(factDir);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join(factDir, "test.dl"),
        expect.stringContaining("out(x) :-\n  TestRelation(x)."),
        "utf8",
      );
    });
  });
});
