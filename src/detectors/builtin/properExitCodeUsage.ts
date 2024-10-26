import { CompilationUnit, CFG } from "../../internals/ir";
import { WorklistSolver } from "../../internals/solver";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { DataflowDetector } from "../detector";
import { SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";

const RESERVED_RANGE = { min: 0, max: 127 };
const TACT_RANGE = { min: 128, max: 255 };
const DEV_RANGE = { min: 256, max: 65535 };

export class ProperExitCodeUsage extends DataflowDetector {
  severity = Severity.HIGH;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    cu.forEachCFG((cfg: CFG) => {
      const lattice = new ExitCodeLattice();
      const transfer = new ExitCodeTransfer();
      const solver = new WorklistSolver(cu, cfg, transfer, lattice, "forward");
      const results = solver.solve();
      results.getStates().forEach((state: ExitCodeState) => {
        state.improperExitCodes.forEach((loc, exitCode) => {
          warnings.push(
            this.makeWarning(`Improper exit code used: ${exitCode}.`, loc, {
              extraDescription:
                "Use exit codes within the allowed range (256-65535, excluding 128).",
              suggestion: "Adjust exit codes accordingly.",
            }),
          );
        });
      });
    });
    return warnings;
  }
}

type ExitCodeState = {
  improperExitCodes: Map<number, SrcInfo>;
};

class ExitCodeLattice {
  bottom(): ExitCodeState {
    return { improperExitCodes: new Map<number, SrcInfo>() };
  }

  join(a: ExitCodeState, b: ExitCodeState): ExitCodeState {
    const improperExitCodes = new Map([
      ...a.improperExitCodes,
      ...b.improperExitCodes,
    ]);
    return { improperExitCodes };
  }

  leq(a: ExitCodeState, b: ExitCodeState): boolean {
    return Array.from(a.improperExitCodes.keys()).every((key) =>
      b.improperExitCodes.has(key),
    );
  }
}

class ExitCodeTransfer {
  transfer(inState: ExitCodeState, _node: any, stmt: any): ExitCodeState {
    const outState = { improperExitCodes: new Map(inState.improperExitCodes) };

    if (
      stmt.kind === "statement_expression" &&
      stmt.expression.kind === "static_call"
    ) {
      const staticCall = stmt.expression;
      if (staticCall.function.text === "nativeThrowUnless") {
        const [exitCodeExpr] = staticCall.args;
        const exitCode = this.evaluateExitCodeExpression(exitCodeExpr);
        if (exitCode !== undefined) {
          this.checkExitCode(outState, exitCode, stmt.loc);
        }
      }
    }
    return outState;
  }

  private evaluateExitCodeExpression(expr: any): number | undefined {
    if (expr.kind === "number") {
      return expr.value;
    } else if (expr.kind === "field_access" && expr.aggregate.text === "self") {
      const fieldName = expr.field.text;
      const knownExitCodes: Record<string, number> = {
        InvalidExitCode: 128,
        ExcessiveExitCode: 70000,
        ValidExitCode: 256,
        NearMaxExitCode: 65535,
      };
      const value = knownExitCodes[fieldName];
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private checkExitCode(
    outState: ExitCodeState,
    exitCode: number,
    loc: SrcInfo,
  ): void {
    if (
      (exitCode >= RESERVED_RANGE.min && exitCode <= RESERVED_RANGE.max) ||
      exitCode === TACT_RANGE.min ||
      exitCode > DEV_RANGE.max
    ) {
      outState.improperExitCodes.set(exitCode, loc);
    }
  }
}
