import { CompilationUnit } from "../../internals/ir";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";

/**
 * A detector that identifies usage of text receivers that could be replaced
 * with binary ones.
 *
 * ## Why is it bad?
 * To prevent conflicts with binary message bodies, text receivers route based
 * on the hash of the message body contents. This is an expensive operation
 * that requires more than 500 units of gas.
 *
 * See: https://docs.tact-lang.org/book/gas-best-practices/#prefer-binary-receivers-to-text-receivers
 *
 * ## Example
 * ```tact
 * receive("one") {}
 * ```
 *
 * Use instead:
 * ```tact
 * message(1) One {}
 * receive(_: One) {}
 * ```
 */
export class PreferBinaryReceiver extends AstDetector {
  severity = Severity.LOW;
  category = Category.OPTIMIZATION;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return Array.from(cu.ast.getFunctions()).reduce((acc, node) => {
      if (
        node.kind === "receiver" &&
        (node.selector.kind === "internal" ||
          node.selector.kind === "external") &&
        node.selector.subKind.kind === "comment"
      ) {
        acc.push(
          this.makeWarning("Prefer binary receiver", node.loc, {
            extraDescription:
              "Using text receivers is a gas-expensive operation",
            suggestion: "Consider changing it to a binary receiver",
          }),
        );
      }
      return acc;
    }, [] as Warning[]);
  }
}
