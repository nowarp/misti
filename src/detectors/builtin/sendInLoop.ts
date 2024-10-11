import { CompilationUnit } from "../../internals/ir";
import { foldStatements, isSelf } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstExpression,
  AstCondition,
  AstStatementTry,
  AstStatementTryCatch,
  AstStatementWhile,
  AstStatementRepeat,
  AstStatementUntil,
  AstStatementForEach,
  idText,
} from "@tact-lang/compiler/dist/grammar/ast";

export class SendInLoop extends ASTDetector {
  severity = Severity.HIGH;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    this.collectWarnings(cu, warnings);
    return warnings;
  }

  private collectWarnings(
    cu: CompilationUnit,
    warnings: MistiTactWarning[],
  ): void {
    const processedLoopIds = new Set<number>();
    for (const node of cu.ast.getProgramEntries()) {
      foldStatements(
        node,
        (accumulatedWarnings, statement) => {
          this.analyzeStatement(
            statement,
            accumulatedWarnings,
            false,
            processedLoopIds,
          );
          return accumulatedWarnings;
        },
        warnings,
        { flatStmts: true },
      );
    }
  }

  private isSendCall(expr: AstExpression): boolean {
    const staticSendFunctions = ["send", "nativeSendMessage"];
    const selfMethodSendFunctions = ["reply", "forward", "notify", "emit"];

    return (
      (expr.kind === "static_call" &&
        staticSendFunctions.includes(idText(expr.function))) ||
      (expr.kind === "method_call" &&
        isSelf(expr.self) &&
        selfMethodSendFunctions.includes(idText(expr.method)))
    );
  }

  private analyzeStatement(
    statement: AstStatement,
    warnings: MistiTactWarning[],
    inLoop: boolean,
    processedLoopIds: Set<number>,
  ): void {
    if (this.isLoopStatement(statement)) {
      // Avoid processing the same loop multiple times
      if (!processedLoopIds.has(statement.id)) {
        processedLoopIds.add(statement.id);
        inLoop = true;
      }
    }

    if (inLoop && statement.kind === "statement_expression") {
      this.reportSendCalls(statement.expression, warnings);
    }

    // Recurse into child stmt
    const childStatements = this.getChildStatements(statement);
    for (const child of childStatements) {
      this.analyzeStatement(child, warnings, inLoop, processedLoopIds);
    }
  }

  private reportSendCalls(
    expr: AstExpression,
    warnings: MistiTactWarning[],
  ): void {
    if (this.isSendCall(expr)) {
      warnings.push(
        this.makeWarning("Send function called inside a loop", expr.loc, {
          suggestion:
            "Consider refactoring to avoid calling send functions inside loops.",
        }),
      );
    }
    this.checkForSendFunctionsInExpression(expr, warnings);
  }

  private checkForSendFunctionsInExpression(
    expr: AstExpression,
    warnings: MistiTactWarning[],
  ): void {
    switch (expr.kind) {
      case "static_call":
      case "method_call":
        if (expr.args && Array.isArray(expr.args)) {
          for (const arg of expr.args) {
            this.reportSendCalls(arg, warnings);
          }
        }
        break;
      case "op_binary":
        this.reportSendCalls(expr.left, warnings);
        this.reportSendCalls(expr.right, warnings);
        break;
      case "op_unary":
        this.reportSendCalls(expr.operand, warnings);
        break;
      case "field_access":
        this.reportSendCalls(expr.aggregate, warnings);
        break;
      case "struct_instance":
        for (const initializer of expr.args) {
          this.reportSendCalls(initializer.initializer, warnings);
        }
        break;
      case "conditional":
        this.reportSendCalls(expr.condition, warnings);
        this.reportSendCalls(expr.thenBranch, warnings);
        this.reportSendCalls(expr.elseBranch, warnings);
        break;
      default:
        break;
    }
  }

  private isLoopStatement(statement: AstStatement): boolean {
    return (
      statement.kind === "statement_while" ||
      statement.kind === "statement_repeat" ||
      statement.kind === "statement_until" ||
      statement.kind === "statement_foreach"
    );
  }

  private getChildStatements(statement: AstStatement): AstStatement[] {
    switch (statement.kind) {
      case "statement_while":
      case "statement_repeat":
      case "statement_until":
      case "statement_foreach":
        const loopStatement = statement as
          | AstStatementWhile
          | AstStatementRepeat
          | AstStatementUntil
          | AstStatementForEach;
        return loopStatement.statements;
      case "statement_condition":
        const condition = statement as AstCondition;
        let statements: AstStatement[] = [...condition.trueStatements];
        if (condition.falseStatements) {
          statements = statements.concat(condition.falseStatements);
        }
        if (condition.elseif) {
          statements.push(condition.elseif);
        }
        return statements;
      case "statement_try":
        const tryStmt = statement as AstStatementTry;
        return tryStmt.statements;
      case "statement_try_catch":
        const tryCatchStmt = statement as AstStatementTryCatch;
        return [...tryCatchStmt.statements, ...tryCatchStmt.catchStatements];
      default:
        return [];
    }
  }
}
