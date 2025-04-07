import { CompilationUnit } from "../../internals/ir";
import { Category, Warning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import { idText } from "@tact-lang/compiler";

/**
 * An optional detector that highlights messages with implicitly defined opcode.
 *
 * ## Why is it bad?
 * Tact automatically generates these unique IDs (opcodes) for every received
 * message, but developers can specify a message opcode explicitly. This enables
 * handling of specific opcodes in the receiver explicitly, which may be
 * convenient when interacting with FunC contracts.
 *
 * See:
 * * https://docs.tact-lang.org/book/structs-and-messages/#message-opcodes
 *
 * ## Example
 * ```tact
 * message TokenNotification {
 *   forwardPayload: Slice as remaining;
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * message(0x7362d09c) TokenNotification {
 *   forwardPayload: Slice as remaining;
 * }
 * ```
 */
export class ImplicitOpcode extends AstDetector {
  severity = Severity.INFO;
  category = Category.BEST_PRACTICES;

  async check(cu: CompilationUnit): Promise<Warning[]> {
    return Array.from(cu.ast.getMessages()).reduce((acc, msg) => {
      if (msg.kind === "message_decl" && msg.opcode === undefined) {
        acc.push(
          this.makeWarning(
            `Message \`${idText(msg.name)}\` has an implicit opcode`,
            msg.loc,
            {
              suggestion: "Prefer explicitly defined message opcodes",
            },
          ),
        );
      }
      return acc;
    }, [] as Warning[]);
  }
}
