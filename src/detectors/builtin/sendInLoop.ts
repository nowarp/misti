import { CompilationUnit } from "../../internals/ir";
import { foldStatements } from "../../internals/tact";
import { MistiTactWarning, Severity } from "../../internals/warnings";
import { ASTDetector } from "../detector";
import {
  AstStatement,
  AstStatementExpression,
  AstExpression,
  AstCondition,
  AstStatementTry,
  AstStatementTryCatch,
  AstStatementWhile,
  AstStatementRepeat,
  AstStatementUntil,
  AstStatementForEach,
  AstFunctionDef,
  AstReceiver,
  AstContractInit,
  idText,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that identifies send function calls inside loops.
 *
 * ## Why is it bad?
 * **Send Functions Inside Loops:**
 * - **Unexpected Behavior:** Multiple sends within a loop may result in sending messages multiple times, which could be unintended. For example, sending funds repeatedly might deplete contract balances or cause logic errors.
 * - **High Gas Consumption:** Loops with send calls can consume excessive gas.
 *
 * **Recommendation:** Refactor the code to avoid calling send functions inside loops.
 *
 * ## Example
 * ```tact
 * // Send function inside a loop
 * while (i < limit) {
 *   send(SendParameters{ to: recipient, ... });
 * }
 * ```
 */
export class SendInLoop extends ASTDetector {
  severity = Severity.HIGH;

  private functionDefinitions: Map<
    string,
    AstFunctionDef | AstReceiver | AstContractInit
  > = new Map();

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    this.collectFunctionDefinitions(cu);
    this.collectWarnings(cu, warnings);
    return warnings;
  }

  /**
   * Collects function definitions, receivers, and contract initializers from the compilation unit.
   */
  private collectFunctionDefinitions(cu: CompilationUnit): void {
    Array.from(cu.ast.getProgramEntries()).forEach(node => {
      if (node.kind === "function_def") {
        const func = node as AstFunctionDef;
        const funcName = idText(func.name);
        this.functionDefinitions.set(funcName, func);
      } else if (node.kind === "receiver") {
        const receiver = node as AstReceiver;
        const funcName = `receiver_${receiver.selector.kind}`;
        this.functionDefinitions.set(funcName, receiver);
      } else if (node.kind === "contract_init") {
        const init = node as AstContractInit;
        const funcName = "contract_init";
        this.functionDefinitions.set(funcName, init);
      }
    });
  }

  /**
   * Collects warnings by traversing the AST of the compilation unit.
   */
  private collectWarnings(
    cu: CompilationUnit,
    warnings: MistiTactWarning[],
  ): void {
    Array.from(cu.ast.getProgramEntries()).forEach(node => {
      foldStatements(
        node,
        (accumulatedWarnings, statement) => {
          this.analyzeStatement(statement, accumulatedWarnings);
          return accumulatedWarnings;
        },
        warnings,
        { flatStmts: true },
      );
    });
  }

  /**
   * Analyzes a statement to detect send function calls inside loops.
   */
  private analyzeStatement(
    statement: AstStatement,
    warnings: MistiTactWarning[],
    inLoop: boolean = false,
    analyzedFunctions: Set<string> = new Set(),
  ): void {
    if (this.isLoopStatement(statement)) {
      this.handleLoopStatement(statement, warnings, analyzedFunctions);
    } else if (this.isConditionalStatement(statement)) {
      this.handleConditionalStatement(
        statement,
        warnings,
        inLoop,
        analyzedFunctions,
      );
    } else if (this.isTryCatchStatement(statement)) {
      this.handleTryCatchStatement(
        statement,
        warnings,
        inLoop,
        analyzedFunctions,
      );
    } else if (statement.kind === "statement_expression") {
      this.handleExpressionStatement(
        statement as AstStatementExpression,
        warnings,
        inLoop,
        analyzedFunctions,
      );
    }
  }

  /**
   * Handles loop statements by analyzing their body statements for send function calls.
   */
  private handleLoopStatement(
    statement: AstStatement,
    warnings: MistiTactWarning[],
    analyzedFunctions: Set<string>,
  ): void {
    const loopStatements = this.getLoopBodyStatements(statement);
    for (const stmt of loopStatements) {
      this.analyzeStatement(stmt, warnings, true, analyzedFunctions);
    }
  }

  /**
   * Handles conditional statements by analyzing their branches.
   */
  private handleConditionalStatement(
    statement: AstStatement,
    warnings: MistiTactWarning[],
    inLoop: boolean,
    analyzedFunctions: Set<string>,
  ): void {
    const condition = statement as AstCondition;
    for (const stmt of condition.trueStatements) {
      this.analyzeStatement(stmt, warnings, inLoop, analyzedFunctions);
    }
    if (condition.falseStatements) {
      for (const stmt of condition.falseStatements) {
        this.analyzeStatement(stmt, warnings, inLoop, analyzedFunctions);
      }
    }
    if (condition.elseif) {
      this.analyzeStatement(
        condition.elseif,
        warnings,
        inLoop,
        analyzedFunctions,
      );
    }
  }

  /**
   * Handles try-catch statements by analyzing their try and catch blocks.
   */
  private handleTryCatchStatement(
    statement: AstStatement,
    warnings: MistiTactWarning[],
    inLoop: boolean,
    analyzedFunctions: Set<string>,
  ): void {
    if (statement.kind === "statement_try") {
      const tryStmt = statement as AstStatementTry;
      for (const stmt of tryStmt.statements) {
        this.analyzeStatement(stmt, warnings, inLoop, analyzedFunctions);
      }
    } else if (statement.kind === "statement_try_catch") {
      const tryCatchStmt = statement as AstStatementTryCatch;
      for (const stmt of tryCatchStmt.statements) {
        this.analyzeStatement(stmt, warnings, inLoop, analyzedFunctions);
      }
      for (const stmt of tryCatchStmt.catchStatements) {
        this.analyzeStatement(stmt, warnings, inLoop, analyzedFunctions);
      }
    }
  }

  /**
   * Handles expression statements by checking for send function calls if inside a loop.
   */
  private handleExpressionStatement(
    statement: AstStatementExpression,
    warnings: MistiTactWarning[],
    inLoop: boolean,
    analyzedFunctions: Set<string>,
  ): void {
    if (inLoop) {
      this.checkForSendFunctions(
        statement.expression,
        warnings,
        analyzedFunctions,
      );
    }
  }

  /**
   * Checks if an expression contains a send function call and records a warning.
   */
  private checkForSendFunctions(
    expr: AstExpression,
    warnings: MistiTactWarning[],
    analyzedFunctions: Set<string>,
  ): void {
    const functionName = this.extractFunctionName(expr);
    if (functionName) {
      if (this.isSendFunction(functionName)) {
        warnings.push(
          this.makeWarning(
            `Send function '${functionName}' called inside a loop`,
            expr.loc,
            {
              suggestion:
                "Consider refactoring to avoid calling send functions inside loops.",
            },
          ),
        );
      } else if (this.functionDefinitions.has(functionName)) {
        if (!analyzedFunctions.has(functionName)) {
          analyzedFunctions.add(functionName);
          const func = this.functionDefinitions.get(functionName)!;
          let statements: AstStatement[] = [];
          if (func.kind === "function_def") {
            statements = func.statements;
          } else if (func.kind === "receiver") {
            statements = func.statements;
          } else if (func.kind === "contract_init") {
            statements = func.statements;
          }
          for (const stmt of statements) {
            this.analyzeStatement(stmt, warnings, true, analyzedFunctions);
          }
          analyzedFunctions.delete(functionName);
        }
      }
    }
    this.checkForSendFunctionsInExpression(expr, warnings, analyzedFunctions);
  }

  /**
   * Recursively checks an expression and its sub-expressions for send function calls.
   */
  private checkForSendFunctionsInExpression(
    expr: AstExpression,
    warnings: MistiTactWarning[],
    analyzedFunctions: Set<string>,
  ): void {
    if (expr.kind === "static_call" || expr.kind === "method_call") {
      if (expr.args && Array.isArray(expr.args)) {
        for (const arg of expr.args) {
          this.checkForSendFunctionsInExpression(
            arg,
            warnings,
            analyzedFunctions,
          );
        }
      }
    } else if (expr.kind === "op_binary") {
      this.checkForSendFunctionsInExpression(
        expr.left,
        warnings,
        analyzedFunctions,
      );
      this.checkForSendFunctionsInExpression(
        expr.right,
        warnings,
        analyzedFunctions,
      );
    } else if (expr.kind === "op_unary") {
      this.checkForSendFunctionsInExpression(
        expr.operand,
        warnings,
        analyzedFunctions,
      );
    } else if (expr.kind === "field_access") {
      this.checkForSendFunctionsInExpression(
        expr.aggregate,
        warnings,
        analyzedFunctions,
      );
    } else if (expr.kind === "struct_instance") {
      for (const initializer of expr.args) {
        this.checkForSendFunctionsInExpression(
          initializer.initializer,
          warnings,
          analyzedFunctions,
        );
      }
    } else if (expr.kind === "conditional") {
      this.checkForSendFunctionsInExpression(
        expr.condition,
        warnings,
        analyzedFunctions,
      );
      this.checkForSendFunctionsInExpression(
        expr.thenBranch,
        warnings,
        analyzedFunctions,
      );
      this.checkForSendFunctionsInExpression(
        expr.elseBranch,
        warnings,
        analyzedFunctions,
      );
    }
  }

  /**
   * Extracts the function name from an expression if it is a function call.
   */
  private extractFunctionName(expr: AstExpression): string | null {
    if (expr.kind === "static_call" && expr.function.kind === "id") {
      return idText(expr.function);
    } else if (expr.kind === "method_call" && expr.method.kind === "id") {
      return idText(expr.method);
    }
    return null;
  }

  /**
   * Determines if a function name corresponds to a send function.
   */
  private isSendFunction(functionName: string): boolean {
    const sendFunctions = [
      "send",
      "self.reply",
      "emit",
      "self.forward",
      "self.notify",
      "nativeSendMessage",
    ];
    return (
      sendFunctions.includes(functionName) &&
      !this.functionDefinitions.has(functionName)
    );
  }

  /**
   * Checks if a statement is a loop statement.
   */
  private isLoopStatement(statement: AstStatement): boolean {
    return (
      statement.kind === "statement_while" ||
      statement.kind === "statement_repeat" ||
      statement.kind === "statement_until" ||
      statement.kind === "statement_foreach"
    );
  }

  /**
   * Retrieves the body statements of a loop.
   */
  private getLoopBodyStatements(statement: AstStatement): AstStatement[] {
    const loopStatement = statement as
      | AstStatementWhile
      | AstStatementRepeat
      | AstStatementUntil
      | AstStatementForEach;
    return loopStatement.statements;
  }

  /**
   * Checks if a statement is a conditional statement.
   */
  private isConditionalStatement(statement: AstStatement): boolean {
    return statement.kind === "statement_condition";
  }

  /**
   * Checks if a statement is a try-catch statement.
   */
  private isTryCatchStatement(statement: AstStatement): boolean {
    return (
      statement.kind === "statement_try" ||
      statement.kind === "statement_try_catch"
    );
  }
}
