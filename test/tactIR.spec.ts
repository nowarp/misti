import { IdxGenerator } from "../src/internals/ir";
import { MistiContext } from "../src/internals/context";
import { TactIRBuilder } from "../src/internals/tactIRBuilder";
import {
  ASTConstant,
  ASTFunction,
  ASTType,
} from "@tact-lang/compiler/dist/grammar/ast";
import { parse } from "@tact-lang/compiler/dist/grammar/grammar";

import path from "path";
import * as fs from "fs";

type ASTStore = {
  functions: ASTFunction[];
  constants: ASTConstant[];
  types: ASTType[];
};

const MISTI_CONFIG_PATH: string = path.resolve(__dirname, "mistiConfig.json");
const TEST_CONTRACTS_PATH: string[] = [__dirname, "contracts"];

function parseWrapper(ast: any): ASTStore {
  const types: ASTType[] = [];
  const functions: ASTFunction[] = [];
  const constants: ASTConstant[] = [];
  for (const e of ast.entries) {
    if (
      e.kind === "def_struct" ||
      e.kind === "def_contract" ||
      e.kind === "def_trait" ||
      e.kind === "primitive"
    ) {
      types.push(e);
    } else if (e.kind === "def_function") {
      functions.push(e);
    } else if (e.kind === "def_native_function") {
      throw new Error("Native functions are not used yet");
    } else if (e.kind === "def_constant") {
      constants.push(e);
    }
  }
  return { functions, constants, types };
}

// Reads a contract from stdin.
function readContract(name: string, src: string): ASTStore {
  const srcPath = path.resolve(...TEST_CONTRACTS_PATH, name);
  const ast = parse(src, srcPath, "user");
  return parseWrapper(ast);
}

// Parses a contract from ./test/contracts/.
function parseContract(name: string): ASTStore {
  const srcPath = path.resolve(...TEST_CONTRACTS_PATH, name);
  const src = fs.readFileSync(srcPath, "utf8");
  const ast = parse(src, srcPath, "user");
  return parseWrapper(ast);
}

describe("TactIRBuilder class", () => {
  afterEach(() => {
    IdxGenerator.__reset();
  });

  it("reads and parses Tact configuration file correctly", () => {
    const configPath = path.resolve(
      __dirname,
      "projects",
      "simple",
      "tactConfig.json",
    );
    const ctx = new MistiContext(MISTI_CONFIG_PATH);
    const builder = new TactIRBuilder(ctx, configPath);
    const config = builder.readTactConfig();
    expect(config.projects[0].name == "Simple");
  });

  it("creates linear-flow CFG correctly", () => {
    const ctx = new MistiContext(MISTI_CONFIG_PATH);
    const builder = new TactIRBuilder(ctx, "/tmp/dummy.json");
    const fun = readContract(
      "linear-flow-1.tact",
      `
fun test(): Int {
    let a: Int = 20;
    let b: Int = 22;
    let c: Int = a + b;
    return c;
}
`,
    ).functions[0];
    const cfg = builder.createCFGFromStatements(
      fun.name,
      "function",
      fun.statements,
      fun.ref,
    );
    expect(cfg.nodes.length == 4);
    expect(cfg.edges.length == 3);
    // only one descendant for body nodes
    expect(cfg.nodes.slice(0, 3).every((node) => node.dstEdges.size == 1));
    // only one ancestor for all nodes expect the first one
    expect(cfg.nodes.slice(1, 4).every((node) => node.srcEdges.size == 1));
    // return edge has no descendants
    expect(cfg.nodes[3].dstEdges.size == 0);
  });

  it("creates conditional CFG correctly", () => {
    const ctx = new MistiContext(MISTI_CONFIG_PATH);
    const builder = new TactIRBuilder(ctx, "/tmp/dummy.json");
    const fun = readContract(
      "conditional-1.tact",
      `
fun test(): Int {
    let a: Int = 20;
    if (a > 42) {
        a = 23;
    }
    let b: Int = a + 1;
    return b;
}
`,
    ).functions[0];
    const cfg = builder.createCFGFromStatements(
      fun.name,
      "function",
      fun.statements,
      fun.ref,
    );
    expect(cfg.nodes.length == 5);
    expect(cfg.edges.length == 5);
    // condition has two descendants
    expect(cfg.nodes[1].dstEdges.size == 2);
    // assignment to b has two ancestors
    expect(cfg.nodes[3].srcEdges.size == 2);
  });

  it("creates loops CFG correctly", () => {
    const ctx = new MistiContext(MISTI_CONFIG_PATH);
    const builder = new TactIRBuilder(ctx, "/tmp/dummy.json");
    const fun = readContract(
      "loops-1.tact",
      `
fun test(): Int {
  let sum: Int = 0;
  let i: Int = 0;
  while (i < 10) {
    i = i + 1;
    sum = sum + i;
  }
  return sum;
}
`,
    ).functions[0];
    const cfg = builder.createCFGFromStatements(
      fun.name,
      "function",
      fun.statements,
      fun.ref,
    );
    expect(cfg.nodes.length == 5);
    expect(cfg.edges.length == 5);
    // loop has two descendants
    expect(cfg.nodes[2].dstEdges.size == 2);
    // return has one ancestor
    expect(cfg.nodes[4].srcEdges.size == 1);
  });
});
