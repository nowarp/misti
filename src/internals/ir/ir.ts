import {
  BasicBlockIdx,
  ContractIdx,
  CFGIdx,
  FunctionName,
  ContractName,
  ProjectName,
} from "./types";
import { CFG, Contract, BasicBlock } from "./cfg";
import { TactASTStore } from "./astStore";
import { AstStatement } from "@tact-lang/compiler/dist/grammar/ast";

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
   * Iterates over all CFGs in a Compilation Unit, and applies a callback to each node in every CFG.
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each node within each CFG.
   */
  forEachCFG(
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
