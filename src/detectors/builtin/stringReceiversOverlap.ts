import { Detector } from "../detector";
import { CompilationUnit } from "../../internals/ir";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import {
  forEachExpression,
  forEachStatement,
} from "../../internals/tactASTUtil";
import {
  AstExpression,
  AstReceiver,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that finds overlapping messages between general string receivers and string receivers.
 *
 * ## Why is it bad?
 *  Constant string receivers and general string receivers can have overlapping messages
 *  in which case the constant string receiver always takes precedence.
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
    return Array.from(cu.ast.getFunctions()).reduce((warnings, node) => {
      if (node.kind === "receiver") {
        const arg = this.findGenericReceiverArg(node);
        if (arg !== undefined) {
          return warnings.concat(
            this.checkConditions(node, arg, stringReceivers),
          );
        }
      }
      return warnings;
    }, [] as MistiTactWarning[]);
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
  ): MistiTactWarning[] {
    const warnings: MistiTactWarning[] = [];
    forEachStatement(receiver, (stmt) => {
      // Conditional statements
      if (stmt.kind === "statement_condition") {
        this.checkCondition(warnings, stmt.condition, argName, stringReceivers);
      }
    });
    forEachExpression(receiver, (expr) => {
      // Ternary conditions
      if (expr.kind === "conditional") {
        this.checkCondition(warnings, expr.condition, argName, stringReceivers);
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
  ): void {
    const isArg = (expr: AstExpression) =>
      expr.kind === "id" && expr.text === argName;
    const isOverlappingStringLiteral = (expr: AstExpression) =>
      expr.kind === "string" && stringReceivers.has(expr.value);
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
