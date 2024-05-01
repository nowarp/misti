import {
  Relation,
  Rule,
  SouffleProgram,
  SouffleExecutor,
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
  const outputDir = "-";
  const soufflePath = "souffle";

  describe("Relation class", () => {
    it("should add facts correctly and emit Datalog syntax", () => {
      const relation = new Relation("TestRelation", [["x", "number"]]);
      relation.addFact([42]);
      expect(relation.emitDecl()).toContain(".decl TestRelation(x:number)");
      expect(relation.emitFacts()).toContain("TestRelation(42).");
    });

    it("should throw error when incorrect number of facts are added", () => {
      const relation = new Relation("TestRelation", [
        ["x", "number"],
        ["y", "number"],
      ]);
      expect(() => relation.addFact([42])).toThrowError();
    });
  });

  describe("SouffleProgram class", () => {
    let program: SouffleProgram;

    beforeEach(() => {
      program = new SouffleProgram("test");
      program.addRelation("TestRelation", undefined, ["x", "number"]);
    });

    it("should compile and dump the facts correctly", async () => {
      program.addFact("TestRelation", 42);
      await program.dump(factDir);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join(factDir, "test.dl"),
        expect.any(String),
        "utf8",
      );
    });

    it("should compile and emit the rules correctly", () => {
      program.addRelation("out", "output", ["x", "number"]);
      program.addRule(
        new Rule([{ name: "out", arguments: ["x"] }], {
          kind: "atom",
          value: { name: "TestRelation", arguments: ["x"] },
          negated: false,
        }),
      );
      const output = program.emit();
      expect(output).toContain(".decl TestRelation(x:number)");
      expect(output).toContain("out(x) :-\n    TestRelation(x).");
    });

    it("should handle rules and relations properly when dumped", async () => {
      program.addRelation("out", "output", ["x", "number"]);
      program.addRule(
        new Rule([{ name: "out", arguments: ["x"] }], {
          kind: "atom",
          value: { name: "TestRelation", arguments: ["x"] },
          negated: false,
        }),
      );
      await program.dump(factDir);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join(factDir, "test.dl"),
        expect.stringContaining("out(x) :-\n    TestRelation(x)."),
        "utf8",
      );
    });
  });

  describe("SouffleExecutor class", () => {
    it("should execute the Souffle program correctly using synchronous method", () => {
      const program = new SouffleProgram("test");
      program.addRelation("TestRelation", "output", ["x", "number"]);
      const executor = new SouffleExecutor(soufflePath, factDir, outputDir);
      const result = executor.executeSync(program);
      const resultsArray = Array.from(result.results.values());
      expect(resultsArray).toStrictEqual([
        [
          ["name", "x"],
          ["result", "42"],
        ],
      ]);
    });
  });
});
