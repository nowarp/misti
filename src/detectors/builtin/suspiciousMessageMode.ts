import { CompilationUnit } from "../../internals/ir";
import { forEachExpression } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstExpression,
  AstStructInstance,
  idText,
  AstOpBinary,
  AstId,
} from "@tact-lang/compiler/dist/grammar/ast";

export class SuspiciousMessageMode extends ASTDetector {
  severity = Severity.MEDIUM;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    Array.from(cu.ast.getProgramEntries()).forEach((node) => {
      forEachExpression(node, (expr) => {
        if (this.isSendParametersStruct(expr)) {
          this.checkSendParameters(expr, warnings);
        }
      });
    });
    return warnings;
  }
  private isSendParametersStruct(expr: AstExpression): boolean {
    if (expr.kind === "struct_instance") {
      return idText((expr as AstStructInstance).type) === "SendParameters";
    }
    return false;
  }

  private checkSendParameters(
    expr: AstExpression,
    warnings: MistiTactWarning[],
  ): void {
    const args = (expr as AstStructInstance).args;
    const modeField = args.find((arg) => idText(arg.field) === "mode");
    if (modeField) {
      this.checkModeExpression(modeField.initializer, warnings);
    }
  }

  private checkModeExpression(
    expr: AstExpression,
    warnings: MistiTactWarning[],
  ): void {
    const flagsUsed = new Set<string>();
    const traverse = (expr: AstExpression): void => {
      switch (expr.kind) {
        case "op_binary":
          const opBinary = expr as AstOpBinary;
          if (opBinary.op !== "|") {
            warnings.push(
              this.makeWarning(
                "Mode expression should only contain the '|' operator",
                expr.loc,
                {
                  suggestion:
                    "Use the '|' operator (bitwise OR) to combine flags",
                },
              ),
            );
          }
          traverse(opBinary.left);
          traverse(opBinary.right);
          break;
        case "id":
          const flagName = idText(expr as AstId);
          if (flagsUsed.has(flagName)) {
            warnings.push(
              this.makeWarning(
                `Flag '${flagName}' is used multiple times in mode expression`,
                expr.loc,
                {
                  suggestion:
                    "Use each flag at most once in the mode expression",
                },
              ),
            );
          } else {
            flagsUsed.add(flagName);
          }
          break;
        case "number":
          warnings.push(
            this.makeWarning(
              "Integer literals should not be used in mode expression; use symbolic constants instead",
              expr.loc,
              {
                suggestion:
                  "Replace integer literals with symbolic flag constants",
              },
            ),
          );
          break;
        default:
          break;
      }
    };
    traverse(expr);
  }
}
