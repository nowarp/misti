/**
 * Defined the Intermediate Representation (IR) for Tact used in analysis.
 *
 * @packageDocumentation
 */
import { TactASTStore } from "./astStore";
import { BasicBlock, CFG } from "./cfg";
import { IdxGenerator } from "./indices";
import {
  BasicBlockIdx,
  CFGIdx,
  ContractIdx,
  ContractName,
  FunctionName,
  ProjectName,
} from "./types";
import { AstStatement, SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Represents a Compilation Unit, encapsulating the information necessary for
 * analyzing a single Tact project.
 */
export class CompilationUnit {
  /**
   * Creates an instance of CompilationUnit.
   * @param projectName The name of the project this Compilation Unit belongs to.
   * @param ast The AST of the project.
   * @param functions A mapping from unique IDs of free functions to their CFGs.
   * @param contracts A mapping from unique IDs of contract entries to contracts.
   */
  constructor(
    public projectName: ProjectName,
    public ast: TactASTStore,
    public functions: Map<CFGIdx, CFG>,
    public contracts: Map<ContractIdx, Contract>,
  ) {}

  /**
   * Looks for a CFG with a specific index.
   * @returns Found CFG or `undefined` if not found.
   */
  public findCFGByIdx(idx: BasicBlockIdx): CFG | undefined {
    const funCfg = this.functions.get(idx);
    if (funCfg) return funCfg;
    return Array.from(this.contracts.values())
      .map((contract) => contract.methods.get(idx))
      .find((cfg) => cfg !== undefined);
  }

  /**
   * Looks for a CFG for a function node with a specific name.
   * @returns Found CFG or `undefined` if not found.
   */
  public findFunctionCFGByName(name: FunctionName): CFG | undefined {
    return Array.from(this.functions.values()).find((cfg) => cfg.name === name);
  }

  /**
   * Looks for a CFG for a method node with a specific name.
   * @returns Found CFG or `undefined` if not found.
   */
  public findMethodCFGByName(
    contractName: ContractName,
    methodName: FunctionName,
  ): CFG | undefined {
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
   * Iterates over all CFGs in a Compilation Unit, and applies a callback to CFG.
   *
   * @param callback The function to apply to each CFG.
   */
  forEachCFG(callback: (cfg: CFG) => void) {
    this.functions.forEach((cfg, _) => {
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
   * @param callback A function that takes the current accumulator and a CFG,
   *                 and returns a new accumulator value.
   * @returns The final accumulated value.
   */
  foldCFGs<T>(init: T, callback: (acc: T, cfg: CFG) => T): T {
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
   * basic block in every CFG.
   *
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each BB within each CFG.
   */
  forEachBasicBlock(
    astStore: TactASTStore,
    callback: (cfg: CFG, node: BasicBlock, stmt: AstStatement) => void,
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
 * Represents an entry for a contract in the compilation unit which
 * encapsulates a collection of related methods and their configurations.
 */
export class Contract {
  /**
   * The unique identifier of this Contract among the compilation unit it belongs to.
   */
  public idx: ContractIdx;

  /**
   * Creates an instance of Contract.
   * @param name The unique name identifying this contract within the project.
   * @param methods A mapping of method ids to their CFGs.
   * @param ref AST reference that corresponds to the contract definition.
   * @param idx An optional unique index. If not set, a new one will be chosen automatically.
   */
  constructor(
    public name: ContractName,
    public methods: Map<CFGIdx, CFG>,
    public ref: SrcInfo,
    idx: ContractIdx | undefined = undefined,
  ) {
    this.idx = idx ? idx : IdxGenerator.next();
  }
}
