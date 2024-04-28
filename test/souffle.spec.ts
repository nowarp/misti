import {
  Relation,
  SouffleProgram,
  SouffleExecutor,
} from "../src/internals/souffle";
import { promises as fs } from "fs";
import path from "path";

jest.mock("fs", () => {
  return {
    promises: {
      writeFile: jest.fn(),
    },
  };
});

jest.mock("child_process", () => {
  return {
    exec: jest.fn((cmd, callback) => {
      callback(null, "Execution complete", "");
    }),
  };
});

describe("Souffle Datalog tests", () => {
  const factDir = "/tmp/misti/souffle";
  const outputDir = "-";
  const soufflePath = "souffle";

  describe("Relation class", () => {
    it("should add facts correctly and emit Datalog syntax", () => {
      const relation = new Relation("TestRelation", [["x", "number"]]);
      relation.addFact([42]);
      expect(relation.emit()).toContain(".decl TestRelation(x:number)");
      expect(relation.emit()).toContain("TestRelation(42).");
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
    it("should compile and dump the facts correctly", async () => {
      const program = new SouffleProgram();
      program.addRelation("TestRelation", ["x", "number"]);
      program.addFact("TestRelation", 42);
      await program.dump(factDir);
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(factDir, "TestRelation.facts"),
        "42",
        "utf8",
      );
    });
  });

  describe("SouffleExecutor class", () => {
    it("should execute the Souffle program correctly", async () => {
      const program = new SouffleProgram();
      program.addRelation("TestRelation", ["x", "number"]);
      const executor = new SouffleExecutor(soufflePath, factDir, outputDir);
      const success = await executor.execute(program);
      expect(success).toBe(true);
    });
  });
});
