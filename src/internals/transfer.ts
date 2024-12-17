import { BasicBlock } from "./ir";
import { AstStatement } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Represents an interface for dataflow transfer functions.
 */
export interface Transfer<State> {
  /**
   * Transforms the input state based on the analysis of a Cfg node.
   *
   * This function updates the state of dataflow analysis as it processes
   * each basic block (e.g., statements, expressions) in a control flow graph,
   * reflecting changes due to program actions.
   *
   * @param bb The Cfg construct being analyzed.
   * @param stmt The statement defined within the node.
   * @param inState The dataflow state prior to the execution of `node`.
   * @returns The updated dataflow state post node execution.
   */
  transfer(inState: State, bb: BasicBlock, stmt: AstStatement): State;
}
