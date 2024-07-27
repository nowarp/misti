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
import { extractPath, forEachExpression } from "../../internals/tactASTUtil";
import {
  AstStatement,
  AstExpression,
  SrcInfo,
  isSelfId,
} from "@tact-lang/compiler/dist/grammar/ast";

type FieldName = string;
type ConstantName = string;

interface VariableState {
  declared: Set<[string, SrcInfo]>;
  // The variable identifier was accessed in any expression
  accessed: Set<string>;
  // The variable value was reassigned
  written: Set<string>;
}

/**
 * A powerset lattice that keeps state of local variables within control flow.
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
    stmt: AstStatement,
  ): VariableState {
    const outState = {
      declared: inState.declared,
      accessed: inState.accessed,
      written: inState.written,
    };
    const processExpressions = (node: AstStatement | AstExpression) => {
      forEachExpression(node, (expr) => {
        if (expr.kind === "id") {
          outState.accessed.add(expr.text);
        }
      });
    };
    if (stmt.kind === "statement_let") {
      outState.declared.add([stmt.name.text, stmt.loc]);
      processExpressions(stmt.expression);
    } else if (stmt.kind === "statement_assign") {
      const name = extractPath(stmt.path);
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
    const defined = this.collectDefinedFields(cu);
    const used = this.collectUsedFields(cu);
    return Array.from(
      new Set([...defined].filter(([name, _ref]) => !used.has(name))),
    ).map(([_name, ref]) =>
      createError(ctx, "Field is never used", Severity.MEDIUM, ref, {
        docURL: makeDocURL(this.id),
        suggestion: "Consider creating a constant instead of field",
      }),
    );
  }

  collectDefinedFields(cu: CompilationUnit): Set<[FieldName, SrcInfo]> {
    return Array.from(cu.ast.getContracts()).reduce((acc, contract) => {
      contract.declarations.forEach((decl) => {
        if (decl.kind === "field_decl") {
          acc.add([decl.name.text, decl.loc]);
        }
      });
      return acc;
    }, new Set<[FieldName, SrcInfo]>());
  }

  collectUsedFields(cu: CompilationUnit): Set<FieldName> {
    return Array.from(cu.ast.getFunctions()).reduce((acc, fun) => {
      forEachExpression(fun, (expr) => {
        if (
          expr.kind === "field_access" &&
          expr.aggregate.kind === "id" &&
          isSelfId(expr.aggregate)
        ) {
          acc.add(expr.field.text);
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

  collectDefinedConstants(cu: CompilationUnit): Set<[ConstantName, SrcInfo]> {
    return Array.from(cu.ast.getConstants({ includeContract: false })).reduce(
      (acc, constant) => {
        acc.add([constant.name.text, constant.loc]);
        return acc;
      },
      new Set<[ConstantName, SrcInfo]>(),
    );
  }

  /**
   * Collects all the identifiers using withing all the statements.
   */
  collectUsedNames(cu: CompilationUnit): Set<ConstantName> {
    return Array.from(cu.ast.getStatements()).reduce((acc, stmt) => {
      forEachExpression(stmt, (expr) => {
        if (expr.kind === "id") {
          acc.add(expr.text);
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
    cu.forEachCFG(cu.ast, (cfg: CFG, _node: Node, _stmt: AstStatement) => {
      if (cfg.origin === "stdlib" || traversedFunctions.has(cfg.name)) {
        return;
      }
      traversedFunctions.add(cfg.name);
      const lattice = new VariableUsageLattice();
      const transfer = new NeverAccessedTransfer();
      const solver = new WorklistSolver(cu, cfg, transfer, lattice, "forward");
      const results = solver.solve();

      const declaredVariables = new Map<string, SrcInfo>();
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
