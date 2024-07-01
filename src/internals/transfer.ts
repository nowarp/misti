import { ASTStatement } from "@tact-lang/compiler/dist/grammar/ast";
import { Node } from "./ir";

/**
 * Represents an interface for dataflow transfer functions.
 */
export interface Transfer<State> {
  /**
   * Transforms the input state based on the analysis of a CFG node.
   *
   * This function updates the state of dataflow analysis as it processes
   * each node (e.g., statements, expressions) in a control flow graph,
   * reflecting changes due to program actions.
   *
   * @param node The CFG construct being analyzed.
   * @param stmt The statement defined within the node.
   * @param inState The dataflow state prior to the execution of `node`.
   * @returns The updated dataflow state post node execution.
   */
  transfer(inState: State, node: Node, stmt: ASTStatement): State;
}
