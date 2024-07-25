import {
  ASTStatement,
  ASTExpression,
  ASTRef,
} from "@tact-lang/compiler/dist/grammar/ast";
import { WorklistSolver } from "../../internals/solver/";
import { Transfer } from "../../internals/transfer";
import { Detector } from "../detector";
import { JoinSemilattice } from "../../internals/lattice";
import { MistiContext } from "../../internals/context";
import { CompilationUnit, Node, CFG } from "../../internals/ir";
import {
  createError,
  MistiTactError,
  Severity,
  makeDocURL,
} from "../../internals/errors";
import { forEachExpression } from "../../internals/tactASTUtil";

type FieldName = string;
type ConstantName = string;

interface VariableState {
  declared: Set<[string, ASTRef]>;
  // The variable identifier was accessed in any expression
  accessed: Set<string>;
  // The variable value was reassigned
  written: Set<string>;
}

/**
 * A powerset lattice that keeps state of local varialbes within control flow.
 */
class VariableUsageLattice implements JoinSemilattice<VariableState> {
  bottom(): VariableState {
    return { declared: new Set(), accessed: new Set(), written: new Set() };
  }

  join(a: VariableState, b: VariableState): VariableState {
    const declared = new Set([...a.declared, ...b.declared]);
    const accessed = new Set([...a.accessed, ...b.accessed]);
    const written = new Set([...a.written, ...b.written]);
    return { declared, accessed, written };
  }

  leq(a: VariableState, b: VariableState): boolean {
    return (
      [...a.declared].every((x) => b.declared.has(x)) &&
      [...a.accessed].every((x) => b.accessed.has(x)) &&
      [...a.written].every((x) => b.written.has(x))
    );
  }
}

class NeverAccessedTransfer implements Transfer<VariableState> {
  public transfer(
    inState: VariableState,
    _node: Node,
    stmt: ASTStatement,
  ): VariableState {
    const outState = {
      declared: inState.declared,
      accessed: inState.accessed,
      written: inState.written,
    };
    const processExpressions = (node: ASTStatement | ASTExpression) => {
      forEachExpression(node, (expr) => {
        if (expr.kind === "id") {
          outState.accessed.add(expr.value);
        }
      });
    };
    if (stmt.kind === "statement_let") {
      outState.declared.add([stmt.name, stmt.ref]);
      processExpressions(stmt.expression);
    } else if (stmt.kind === "statement_assign") {
      const name = stmt.path.map((p) => p.name).join(".");
      outState.written.add(name);
      processExpressions(stmt.expression);
    } else {
      processExpressions(stmt);
    }
    return outState;
  }
}

/**
 * A detector that identifies write-only or unused variables, fields and constants.
 *
 * ## Why is it bad?
 * These variables are either assigned but never used in any meaningful computation,
 * or they are declared and never used at all, which may indicate redundant code
 * or an incomplete implementation of the intended logic.
 *
 * ## Example
 * ```tact
 * // Error: the developer forgot to use the constant
 * const MAX_SUPPLY: Int = 1000;
 *
 * fun mint(to: Address, amount: Int) {
 *   balances.set(to, balances.get(to)!! + amount);
 *   totalSupply += amount;
 * }
 * ```
 *
 * Use instead:
 * ```tact
 * const MAX_SUPPLY: Int = 1000;
 *
 * fun mint(to: Address, amount: Int) {
 *   // OK: Fixed after the linter highlighted this warning
 *   require(totalSupply + amount <= MAX_SUPPLY, "Exceeds max supply");
 *   balances.set(to, balances.get(to)!! + amount);
 *   totalSupply += amount;
 * }
 * ```
 */
export class NeverAccessedVariables extends Detector {
  check(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    return [
      ...this.checkFields(ctx, cu),
      ...this.checkConstants(ctx, cu),
      ...this.checkVariables(ctx, cu),
    ];
  }

  checkFields(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    const definedFields = this.collectDefinedFields(cu);
    const usedFields = this.collectUsedFields(cu);
    return Array.from(
      new Set(
        [...definedFields].filter(([name, _ref]) => !usedFields.has(name)),
      ),
    ).map(([_name, ref]) =>
      createError(ctx, "Field is never used", Severity.MEDIUM, ref, {
        docURL: makeDocURL(this.id),
        suggestion: "Consider removing the field",
      }),
    );
  }

  collectDefinedFields(cu: CompilationUnit): Set<[FieldName, ASTRef]> {
    return Array.from(cu.ast.getContracts()).reduce((acc, contract) => {
      contract.declarations.forEach((decl) => {
        if (decl.kind === "def_field") {
          acc.add([decl.name, decl.ref]);
        }
      });
      return acc;
    }, new Set<[FieldName, ASTRef]>());
  }

  collectUsedFields(cu: CompilationUnit): Set<FieldName> {
    return Array.from(cu.ast.getFunctions()).reduce((acc, fun) => {
      forEachExpression(fun, (expr) => {
        if (expr.kind === "op_field" && expr.src.kind === "id") {
          acc.add(expr.src.value);
        }
      });
      return acc;
    }, new Set<FieldName>());
  }

  checkConstants(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    const definedConstants = this.collectDefinedConstants(cu);
    const usedConstants = this.collectUsedNames(cu);
    return Array.from(
      new Set(
        [...definedConstants].filter(
          ([name, _ref]) => !usedConstants.has(name),
        ),
      ),
    ).map(([_name, ref]) =>
      createError(ctx, "Constant is never used", Severity.MEDIUM, ref, {
        docURL: makeDocURL(this.id),
        suggestion: "Consider removing the constant",
      }),
    );
  }

  collectDefinedConstants(cu: CompilationUnit): Set<[ConstantName, ASTRef]> {
    return Array.from(cu.ast.getConstants(false)).reduce((acc, constant) => {
      acc.add([constant.name, constant.ref]);
      return acc;
    }, new Set<[ConstantName, ASTRef]>());
  }

  /**
   * Collects all the identifiers using withing all the statements.
   */
  collectUsedNames(cu: CompilationUnit): Set<ConstantName> {
    return Array.from(cu.ast.getStatements()).reduce((acc, stmt) => {
      forEachExpression(stmt, (expr) => {
        if (expr.kind === "id") {
          acc.add(expr.value);
        }
      });
      return acc;
    }, new Set<FieldName>());
  }

  /**
   * Checks never accessed local variables in all the functions leveraging the
   * monotonic framework and the fixpoint dataflow solver.
   */
  checkVariables(ctx: MistiContext, cu: CompilationUnit): MistiTactError[] {
    const errors: MistiTactError[] = [];
    const traversedFunctions = new Set<string>();
    cu.forEachCFG(cu.ast, (cfg: CFG, _node: Node, _stmt: ASTStatement) => {
      if (cfg.origin === "stdlib" || traversedFunctions.has(cfg.name)) {
        return;
      }
      traversedFunctions.add(cfg.name);
      const lattice = new VariableUsageLattice();
      const transfer = new NeverAccessedTransfer();
      const solver = new WorklistSolver(cu, cfg, transfer, lattice, "forward");
      const results = solver.solve();

      const declaredVariables = new Map<string, ASTRef>();
      const accessedVariables = new Set<string>();
      const writtenVariables = new Set<string>();
      results.getStates().forEach((state, nodeIdx) => {
        if (!cfg.getNode(nodeIdx)!.isExit()) {
          return;
        }
        state.declared.forEach(([name, ref]) =>
          declaredVariables.set(name, ref),
        );
        state.accessed.forEach((name) => accessedVariables.add(name));
        state.written.forEach((name) => writtenVariables.add(name));
      });
      Array.from(declaredVariables.keys()).forEach((name) => {
        if (!accessedVariables.has(name)) {
          const isWritten = writtenVariables.has(name);
          const msg = isWritten
            ? "Write-only variable"
            : "Variable is never accessed";
          const suggestion = isWritten
            ? "The variable value should be accessed"
            : "Consider removing the variable";
          errors.push(
            createError(
              ctx,
              msg,
              Severity.MEDIUM,
              declaredVariables.get(name)!,
              {
                docURL: makeDocURL(this.id),
                suggestion,
              },
            ),
          );
        }
      });
    });

    return errors;
  }
}
