import { MistiContext } from "../context";
import { CFG, BasicBlockIdx, CompilationUnit } from "../ir";
import { InternalException } from "../exceptions";
import { SolverResults } from "./results";
import { Solver } from "./solver";
import {
  SouffleContext,
  SouffleFact,
  SouffleExecutionResult,
  SouffleSyncExecutor,
  relation,
} from "@nowarp/souffle";
import { SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Basic block definition added in all the Souffle programs.
 */
const BB_FACT = (idx: BasicBlockIdx): string => `bb_${idx}`;

/**
 * An interface for a specific dataflow problem used to generate a Soufflé program.
 *
 * It is used to express the dataflow problem and serves the same purpose as the transfer
 * function when using the worklist fixpoint algorithm. The join/meet semilattice
 * operations should be expressed implicitly in the Soufflé rules. Maintaining the
 * monotonicity property is a responsibility of the user, i.e. the designed rules
 * must ensure that the dataflow information only grows or remains the same.
 *
 * When implementing definitions inside the functions of this interface, the user can refer
 * to some fields that have special meanings and are added by the Soufflé solver by default:
 * * `bb${index}` - Basic block with the given index
 * * `edge` - Edge relations between two blocks
 */
export interface SouffleMapper {
  /**
   * Adds Souffle declarations specific for the dataflow problem.
   *
   * Example:
   * `.decl var_defined(bb: symbol, var: symbol)` - Variables defined in dataflow
   */
  addDecls(ctx: SouffleContext<SrcInfo>): void;

  /**
   * Adds Souffle rules specific for the dataflow problem.
   *
   * Example:
   * `out(bb, var) :- pred(bb, predBB), in(predBB, var).` - Computes the `out` state based on the `in` state
   */
  addRules(ctx: SouffleContext<SrcInfo>): void;

  /**
   * Adds Souffle facts to describe constraints for the dataflow problem.
   *
   * Example:
   * `var_defined("bb4", "x").` - Variable `x` is defined within the basic block with index 4
   */
  addConstraints(ctx: SouffleContext<SrcInfo>): void;
}

/**
 * Provides a framework for solving dataflow analysis problems using the Soufflé solver.
 */
export class SouffleSolver<State> implements Solver<State> {
  /**
   * @param detectorId An unique identifier of the detector using this solver.
   * @param cu Compilation unit under the analysis.
   * @param cfg CFG under the analysis.
   * @param mapper An object that defines the transfer operation for a node and its state.
   */
  constructor(
    private readonly detectorId: string,
    private readonly ctx: MistiContext,
    private readonly cu: CompilationUnit,
    private readonly cfg: CFG,
    private readonly mapper: SouffleMapper,
  ) {}

  /**
   * Adds common declarations to represent the dataflow problem.
   * @param ctx The Souffle program where the relations are to be added.
   */
  private addDataflowDecls(ctx: SouffleContext<SrcInfo>): void {
    // Basic block declaration
    ctx.add(relation("bb", [["bb", "Symbol"]], undefined));
    // Predecessor declaration
    ctx.add(
      relation(
        "pred",
        [
          ["bb_src", "Symbol"],
          ["bb_dst", "Symbol"],
        ],
        undefined,
      ),
    );
  }

  /**
   * Adds common facts to represent the dataflow problem.
   * @param ctx The Souffle program where the relations are to be added.
   */
  private addDataflowFacts(ctx: SouffleContext<SrcInfo>): void {
    this.cfg.forEachBasicBlock(this.cu.ast, (_stmt, node) => {
      ctx.addFact("bb", [BB_FACT(node.idx)]);
    });
    this.cfg.forEachEdge((edge) => {
      ctx.addFact("edge", [BB_FACT(edge.src), BB_FACT(edge.dst)]);
    });
  }

  /**
   * Executes the Souffle program generated within the solver.
   */
  private execute(
    ctx: SouffleContext<SrcInfo>,
  ): SouffleExecutionResult<SrcInfo> {
    const executor = new SouffleSyncExecutor<SrcInfo>({
      inputDir: this.ctx.config.soufflePath,
      outputDir: this.ctx.config.soufflePath,
    });
    return executor.execute(ctx);
  }

  /**
   * Converts the souffle execution results to the solver results as required by the class interface.
   */
  private createSouffleResults(
    _souffleResults: SouffleFact<SrcInfo>[][],
  ): SolverResults<State> {
    throw new Error("NYI");
  }

  public solve(): SolverResults<State> {
    const ctx: SouffleContext<SrcInfo> = new SouffleContext<SrcInfo>(
      this.detectorId,
    );
    this.addDataflowDecls(ctx);
    this.mapper.addDecls(ctx);
    this.mapper.addRules(ctx);
    this.addDataflowFacts(ctx);
    this.mapper.addConstraints(ctx);
    const result = this.execute(ctx);
    if (result.kind !== "structured") {
      throw InternalException.make(
        `Error executing Soufflé:\n${result.kind === "error" ? result.stderr : "Cannot unmarshal raw output:\n" + result.results}`,
      );
    }
    return this.createSouffleResults(
      Array.from(result.results.entries.values()),
    );
  }
}
