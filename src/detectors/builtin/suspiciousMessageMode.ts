import { CompilationUnit } from "../../internals/ir";
import { forEachExpression } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { AstDetector } from "../detector";
import {
  AstExpression,
  AstStructInstance,
  idText,
  AstOpBinary,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Detects suspicious usage of the `mode` field in `SendParameters` struct instances.
 *
 * ## Why is it bad?
 * Incorrect usage of the `mode` field in `SendParameters` can lead to unintended behavior when sending messages,
 * such as incorrect flags being set, which can cause security vulnerabilities or unexpected contract behavior.
 *
 * **What it checks:**
 * - Ensures that the `mode` expression only uses the bitwise OR operator `|`.
 * - Warns if integer literals are used instead of symbolic constants.
 * - Warns if the same flag is used multiple times in the `mode` expression.
 *
 * ## Example
 *
 * ```tact
 * // Suspicious usage:
 * send(SendParameters{
 *     to: recipient,
 *     value: amount,
 *     mode: SendRemainingBalance | SendRemainingBalance // Bad: Duplicate flag
 * });
 *
 * // Correct usage:
 * send(SendParameters{
 *     to: recipient,
 *     value: amount,
 *     mode: SendRemainingBalance | SendDestroyIfZero // Ok
 * });
 * ```
 */
export class SuspiciousMessageMode extends AstDetector {
  severity = Severity.MEDIUM;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    Array.from(cu.ast.getProgramEntries()).forEach((node) => {
      forEachExpression(node, (expr) => {
        if (
          expr.kind === "struct_instance" &&
          idText(expr.type) === "SendParameters"
        ) {
          this.checkSendParameters(expr, warnings);
        }
      });
    });
    return warnings;
  }

  private checkSendParameters(
    expr: AstStructInstance,
    warnings: MistiTactWarning[],
  ): void {
    const args = expr.args;
    const modeField = args.find((arg) => idText(arg.field) === "mode");
    if (modeField) {
      this.checkModeExpression(modeField.initializer, warnings);
    }
  }

  private checkModeExpression(
    expr: AstExpression,
    warnings: MistiTactWarning[],
  ): void {
    if (expr.kind === "number" && expr.value === 0n) {
      warnings.push(
        this.makeWarning(
          "Setting `mode` to `0` is redundant as it has no effect.",
          expr.loc,
          {
            suggestion:
              "Remove the `mode` field or set it to `SendDefaultMode`.",
          },
        ),
      );
      return;
    }

    const flagsUsed = new Set<string>();
    forEachExpression(expr, (e) => {
      switch (e.kind) {
        case "op_binary":
          const opBinary = e as AstOpBinary;
          if (opBinary.op !== "|") {
            warnings.push(
              this.makeWarning(
                "Mode expression should only contain the '|' operator",
                e.loc,
                {
                  suggestion:
                    "Use the '|' operator (bitwise OR) to combine flags",
                },
              ),
            );
          }
          break;
        case "id":
          const flagName = idText(e);
          if (flagsUsed.has(flagName)) {
            warnings.push(
              this.makeWarning(
                `Flag \`${flagName}\` is used multiple times in the \`mode\` expression`,
                e.loc,
                {
                  suggestion:
                    "Use each flag at most once in the mode expression",
                },
              ),
            );
          }
          flagsUsed.add(flagName);
          break;
        case "number":
          let suggestion: string = `Replace integer literal \`${e.value}\` with symbolic flag constants`;
          if (e.value === 64n) {
            suggestion = "Replace `64` with `SendRemainingValue`";
          } else if (e.value === 128n) {
            suggestion = "Replace `128` with `SendRemainingBalance`";
          }
          warnings.push(
            this.makeWarning(
              "Integer literals should not be used in mode expression",
              e.loc,
              {
                suggestion,
              },
            ),
          );
          break;
        default:
          break;
      }
    });
  }
}
