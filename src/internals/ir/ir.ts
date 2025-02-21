/**
 * Defined the Intermediate Representation (IR) for Tact used in analysis.
 *
 * @packageDocumentation
 */
import { CfgIdx, ContractName, FunctionName, ProjectName } from ".";
import { AstStore } from "./astStore";
import { CallGraph } from "./callGraph";
import { BasicBlock, Cfg } from "./cfg";
import { ImportGraph } from "./imports";
import { IdxGenerator } from "./indices";
import { AstStatement, SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";

export type TraitContractIdx = number & { readonly __brand: unique symbol };

/**
 * Represents a Compilation Unit, encapsulating the information necessary for
 * analyzing a single Tact project.
 */
export class CompilationUnit {
  /**
   * Creates an instance of CompilationUnit.
   * @param projectName The name of the project this Compilation Unit belongs to.
   * @param ast The AST of the project.
   * @param imports A graph showing the connections between project files.
   * @param functions A mapping from unique IDs of free functions to their CFGs.
   * @param contracts A mapping contract ids to their entries.
   * @param traits A mapping trait ids to their entries.
   */
  constructor(
    public readonly projectName: ProjectName,
    public readonly ast: AstStore,
    public readonly imports: ImportGraph,
    public readonly callGraph: CallGraph,
    public readonly functions: Map<CfgIdx, Cfg>,
    private readonly contracts: Map<TraitContractIdx, Contract>,
    private readonly traits: Map<TraitContractIdx, Trait>,
  ) {}

  public getContracts(): Map<TraitContractIdx, Contract> {
    return this.contracts;
  }
  public getTraits({
    includeStdlib = true,
  }: Partial<{ includeStdlib: boolean }> = {}): Map<TraitContractIdx, Trait> {
    if (includeStdlib) return this.traits;
    return new Map(
      [...this.traits].filter(([_, t]) => t.loc.origin !== "stdlib"),
    );
  }
  public getContractsTraits({
    includeStdlib = true,
  }: Partial<{ includeStdlib: boolean }> = {}): Map<
    TraitContractIdx,
    TraitContract
  > {
    const contracts = this.getContracts();
    const traits = this.getTraits({ includeStdlib });
    const merged = new Map<TraitContractIdx, TraitContract>();
    for (const [key, contract] of contracts) merged.set(key, contract);
    for (const [key, trait] of traits) merged.set(key, trait);
    return merged;
  }

  /**
   * Looks for a CFG with a specific index.
   * @returns Found CFG or `undefined` if not found.
   */
  public findCfgByIdx(idx: CfgIdx): Cfg | undefined {
    const funCfg = this.functions.get(idx);
    if (funCfg) return funCfg;
    return Array.from(this.contracts.values())
      .map((contract) => contract.methods.get(idx))
      .find((cfg) => cfg !== undefined);
  }

  /**
   * Looks for a Cfg for a function node with a specific name.
   * @returns Found Cfg or `undefined` if not found.
   */
  public findFunctionCFGByName(name: FunctionName): Cfg | undefined {
    return Array.from(this.functions.values()).find((cfg) => cfg.name === name);
  }

  /**
   * Looks for a Cfg for a method node with a specific name.
   * @returns Found Cfg or `undefined` if not found.
   */
  public findMethodCFGByName(
    contractName: ContractName,
    methodName: FunctionName,
  ): Cfg | undefined {
    const contract = Array.from(this.contracts.values()).find(
      (contract) => contract.name === contractName,
    );
    if (!contract) {
      return undefined;
    }
    const cfg = Array.from(contract.methods.values()).find(
      (cfg) => cfg.name === methodName,
    );
    return cfg;
  }

  /**
   * Iterates over all CFGs in a Compilation Unit, and applies a callback to Cfg.
   *
   * @param callback The function to apply to each Cfg.
   */
  public forEachCFG(
    callback: (cfg: Cfg) => void,
    { includeStdlib = true }: Partial<{ includeStdlib: boolean }> = {},
  ) {
    this.functions.forEach((cfg, _) => {
      if (!includeStdlib && cfg.origin === "stdlib") {
        return;
      }
      callback(cfg);
    });
    this.contracts.forEach((contract) => {
      contract.methods.forEach((cfg, _) => {
        callback(cfg);
      });
    });
  }

  /**
   * Performs a fold operation over all CFGs in the Compilation Unit.
   *
   * @param init The initial value of the accumulator.
   * @param callback A function that takes the current accumulator and a Cfg,
   *                 and returns a new accumulator value.
   * @returns The final accumulated value.
   */
  public foldCFGs<T>(init: T, callback: (acc: T, cfg: Cfg) => T): T {
    let acc = init;
    this.functions.forEach((cfg) => {
      acc = callback(acc, cfg);
    });
    this.contracts.forEach((contract) => {
      contract.methods.forEach((cfg) => {
        acc = callback(acc, cfg);
      });
    });
    return acc;
  }

  /**
   * Iterates over all CFGs in a Compilation Unit, and applies a callback to each
   * basic block in every Cfg.
   *
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each BB within each Cfg.
   */
  public forEachBasicBlock(
    astStore: AstStore,
    callback: (cfg: Cfg, node: BasicBlock, stmt: AstStatement) => void,
  ) {
    // Iterate over all functions' CFGs
    this.functions.forEach((cfg, _) => {
      cfg.forEachBasicBlock(astStore, (stmt, node) => {
        callback(cfg, node, stmt);
      });
    });

    // Iterate over all contracts and their methods' CFGs
    this.contracts.forEach((contract) => {
      contract.methods.forEach((cfg, _) => {
        cfg.forEachBasicBlock(astStore, (stmt, node) => {
          callback(cfg, node, stmt);
        });
      });
    });
  }
}

/**
 * Base class representing a common structure for contracts and traits.
 */
export abstract class TraitContract {
  /**
   * The unique identifier of this entity among the compilation unit it belongs to.
   */
  public idx: TraitContractIdx;

  constructor(
    public name: ContractName,
    public methods: Map<CfgIdx, Cfg>,
    public loc: SrcInfo,
    idx: TraitContractIdx | undefined = undefined,
  ) {
    this.idx = idx
      ? idx
      : (IdxGenerator.next("ir_trait_contract") as TraitContractIdx);
  }

  /**
   * Determines if this is a contract or a trait.
   */
  abstract get kind(): "contract" | "trait";
}

/**
 * Represents a smart contract with full implementation capabilities.
 */
export class Contract extends TraitContract {
  get kind(): "contract" {
    return "contract";
  }
}

/**
 * Represents a trait (interface with optional method implementations).
 */
export class Trait extends TraitContract {
  get kind(): "trait" {
    return "trait";
  }
}
