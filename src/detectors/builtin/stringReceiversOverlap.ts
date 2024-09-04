import { Detector } from "../detector";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { CompilationUnit, BasicBlock, CFG } from "../../internals/ir";
import {
  forEachExpression,
  forEachStatement,
} from "../../internals/tactASTUtil";
import { JoinSemilattice } from "../../internals/lattice";
import { WorklistSolver } from "../../internals/solver/";
import { Transfer } from "../../internals/transfer";
import {
  AstExpression,
  AstStatementLet,
  AstStatement,
  AstReceiver,
} from "@tact-lang/compiler/dist/grammar/ast";

interface TaintState {
  // Generic receiver's string argument name
  readonly argName: string;
  // String receiver names
  readonly stringReceiverNames: Set<string>;
  // Variables tainted with receiver's argument
  argTaint: Set<string>;
  // Variables tainted with string literal used in a string receiver
  literalTaint: Set<string>;
}

/**
 * A powerset lattice that keeps taint state in dataflow.
 */
class TaintLattice implements JoinSemilattice<TaintState> {
  constructor(
    private readonly argName: string,
    private readonly stringReceiverNames: Set<string>,
  ) {}

  bottom(): TaintState {
    return {
      argName: this.argName,
      stringReceiverNames: this.stringReceiverNames,
      argTaint: new Set(),
      literalTaint: new Set(),
    };
  }

  join(a: TaintState, b: TaintState): TaintState {
    const argTaint = new Set([...a.argTaint, ...b.argTaint]);
    const literalTaint = new Set([...a.literalTaint, ...b.literalTaint]);
    return {
      argName: this.argName,
      stringReceiverNames: this.stringReceiverNames,
      argTaint,
      literalTaint,
    };
  }

  leq(a: TaintState, b: TaintState): boolean {
    return (
      [...a.argTaint].every((x) => b.argTaint.has(x)) &&
      [...a.literalTaint].every((x) => b.literalTaint.has(x))
    );
  }
}

class StringReceiversOverlapTransfer implements Transfer<TaintState> {
  public transfer(
    inState: TaintState,
    _node: BasicBlock,
    stmt: AstStatement,
  ): TaintState {
    const outState = {
      argName: inState.argName,
      stringReceiverNames: inState.stringReceiverNames,
      argTaint: inState.argTaint,
      literalTaint: inState.literalTaint,
    };
    this.processStatements(outState, stmt);
    return outState;
  }

  /**
   * Processes taint information for untyped let statements in the following format:
   * var newTaint = <id | literal | previousTaint>;
   */
  private processUntypedLet(outState: TaintState, stmt: AstStatementLet): void {
    if (stmt.expression.kind === "id") {
      const rhs = stmt.expression.text;
      if (rhs === outState.argName || outState.argTaint.has(rhs)) {
        // let newTaint = arg;
        // let newTaint = previousArgTaint;
        outState.argTaint.add(stmt.name.text);
      } else if (outState.literalTaint.has(rhs)) {
        // let newTaint = previousLiteralTaint;
        outState.literalTaint.add(stmt.name.text);
      }
    } else if (
      stmt.expression.kind === "string" &&
      outState.stringReceiverNames.has(stmt.expression.value)
    ) {
      // let newTaint = "receiverName";
      outState.literalTaint.add(stmt.name.text);
    }
  }

  /**
   * Processes taint information for typed let statements in the following format:
   * let newTaint: String = <id | literal | previousTaint>;
   */
  private processTypedLet(outState: TaintState, stmt: AstStatementLet): void {
    forEachExpression(stmt.expression, (expr) => {
      if (expr.kind === "id") {
        // Any operation involving receiver's argument or previous taints with it creates a new taint
        if (
          expr.text === outState.argName ||
          outState.argTaint.has(expr.text)
        ) {
          outState.argTaint.add(stmt.name.text);
        }
        // Any operation involving string receiver name or previous taints with it creates a new taint
        if (
          outState.stringReceiverNames.has(expr.text) ||
          outState.literalTaint.has(expr.text)
        ) {
          outState.literalTaint.add(stmt.name.text);
        }
      } else if (
        expr.kind === "string" &&
        outState.stringReceiverNames.has(expr.value)
      ) {
        // New taint with receiver name
        outState.literalTaint.add(stmt.name.text);
      }
    });
  }

  private processStatements(outState: TaintState, stmt: AstStatement): void {
    if (stmt.kind === "statement_let") {
      if (stmt.type === null) {
        // var newTaint = <id | literal | previousTaint>;
        this.processUntypedLet(outState, stmt);
      } else if (stmt.type.kind === "type_id" && stmt.type.text === "String") {
        // let newTaint: String = <expr involving taints>;
        this.processTypedLet(outState, stmt);
      }
    }
  }
}

/**
 * A detector that finds overlapping messages between general string receivers and string receivers.
 *
 * ## Why is it bad?
 * Constant string receivers and general string receivers can have overlapping messages
 * in which case the constant string receiver always takes precedence.
 *
 * ## Example
 * ```tact
 * contract Test {
 *   receive("foobar") { throw(1042) }
 *   receive(msg: String) {
 *     if (msg == "foobar") { throw(1043)  } // Bad: Dead code
 *   }
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * contract Test {
 *   receive("foobar") { throw(1042) }
 *   receive(msg: String) {}
 * }
 * ```
 */
export class StringReceiversOverlap extends Detector {
  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const stringReceivers = this.getStringReceiverNames(cu);
    let warnings: MistiTactWarning[] = [];
    cu.forEachCFG(cu.ast, (cfg: CFG) => {
      const node = cu.ast.getFunction(cfg.id);
      if (node !== undefined && node.kind === "receiver") {
        const arg = this.findGenericReceiverArg(node);
        if (arg !== undefined) {
          // Solve the dataflow problem to find taints at each point of the program
          const lattice = new TaintLattice(arg, stringReceivers);
          const transfer = new StringReceiversOverlapTransfer();
          const solver = new WorklistSolver(
            cu,
            cfg,
            transfer,
            lattice,
            "forward",
          );
          const taintResults = solver.solve();

          // Inspect conditions in each statement with respect to its taint state.
          cfg.forEachBasicBlock(cu.ast, (stmt, bb) => {
            const state = taintResults.getState(bb.idx);
            if (state === undefined) {
              this.ctx.logger.warn(
                `${this.id}: Cannot find BasicBlock #${bb.idx}`,
              );
              return;
            }
            warnings = warnings.concat(
              this.checkConditions(
                node,
                arg,
                stringReceivers,
                state.literalTaint,
                state.argTaint,
              ),
            );
          });
          return warnings;
        }
      }
    });
    return warnings;
  }

  /**
   * Checks violations of the detector rules in the body of generic string receiver.
   * @param receiver Generic string receiver
   * @param argName Name of the argument that overlaps with one of the string receivers
   */
  private checkConditions(
    receiver: AstReceiver,
    argName: string,
    stringReceivers: Set<string>,
    literalTaints: Set<string>,
    argTaints: Set<string>,
  ): MistiTactWarning[] {
    const warnings: MistiTactWarning[] = [];
    forEachStatement(receiver, (stmt) => {
      // Conditional statements
      if (stmt.kind === "statement_condition") {
        this.checkCondition(
          warnings,
          stmt.condition,
          argName,
          stringReceivers,
          literalTaints,
          argTaints,
        );
      }
    });
    forEachExpression(receiver, (expr) => {
      // Ternary conditions
      if (expr.kind === "conditional") {
        this.checkCondition(
          warnings,
          expr.condition,
          argName,
          stringReceivers,
          literalTaints,
          argTaints,
        );
      }
    });
    return warnings;
  }

  /**
   * Adds a warning to `warnings` if `condition` contains a comparison operation
   * involving the overlapping arg.
   */
  private checkCondition(
    warnings: MistiTactWarning[],
    condition: AstExpression,
    argName: string,
    stringReceivers: Set<string>,
    literalTaints: Set<string>,
    argTaints: Set<string>,
  ): void {
    const isArg = (expr: AstExpression) =>
      expr.kind === "id" && (expr.text === argName || argTaints.has(expr.text));
    const isOverlappingStringLiteral = (expr: AstExpression) =>
      (expr.kind === "string" && stringReceivers.has(expr.value)) ||
      (expr.kind === "id" && literalTaints.has(expr.text));
    const isOverlappingComparison = (lhs: AstExpression, rhs: AstExpression) =>
      isArg(lhs) && isOverlappingStringLiteral(rhs);
    // Iterate recursively to find cases like `(msg === "overlap") && whatever_else`
    forEachExpression(condition, (expr) => {
      if (
        expr.kind === "op_binary" &&
        ["==", "!="].includes(expr.op) &&
        (isOverlappingComparison(expr.left, expr.right) ||
          isOverlappingComparison(expr.right, expr.left))
      ) {
        const receiverName = `receiver("${argName}")`;
        const warn = this.makeWarning(
          "String Receivers Overlap",
          Severity.HIGH,
          condition.loc,
          {
            extraDescription: [
              `${receiverName} might be called instead.`,
              `This condition might never be executed.`,
            ].join(" "),
            suggestion: `Implement the desired logic in ${receiverName} and remove ${expr.loc.contents}`,
          },
        );
        warnings.push(warn);
      }
    });
  }

  /**
   * Returns the name of the argument if the given receiver is a generic string
   * receiver: `receive(arg: String)`.
   */
  private findGenericReceiverArg(receiver: AstReceiver): string | undefined {
    return receiver.selector.kind === "internal-simple" &&
      receiver.selector.param.type.kind === "type_id" &&
      receiver.selector.param.type.text === "String"
      ? receiver.selector.param.name.text
      : undefined;
  }

  private getStringReceiverNames(cu: CompilationUnit): Set<string> {
    return Array.from(cu.ast.getFunctions()).reduce((acc, node) => {
      if (
        node.kind === "receiver" &&
        node.selector.kind === "internal-comment"
      ) {
        acc.add(node.selector.comment.value);
      }
      return acc;
    }, new Set<string>());
  }
}
