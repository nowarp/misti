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
  AstNumber,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * A detector that identifies send function calls inside loops and loops that may cause out-of-gas exceptions.
 *
 * ## Why is it bad?
 * **Send Functions Inside Loops:**
 * - **Unexpected Behavior:** Multiple sends may occur, leading to unintended contract interactions.
 * - **High Gas Consumption:** Loops with send calls can consume excessive gas, potentially causing out-of-gas exceptions.
 * - **Reentrancy Vulnerabilities:** Sending messages within loops might open up reentrancy attack vectors.
 *
 * **Loops with Excessive Iterations:**
 * - **Out-of-Gas Exceptions:** Loops with a large number of iterations may consume all available gas.
 * - **Denial of Service:** Excessive gas consumption can be exploited to create DoS attacks.
 *
 * ## Example
 * ```tact
 * // Send function inside a loop
 * while (i < limit) {
 *   send(SendParameters{ to: recipient, ... });
 * }
 *
 * // Loop with excessive iterations
 * repeat (1_000_001) {
 *   // ...
 * }
 * ```
 *
 * **Recommendation:** Refactor the code to avoid calling send functions inside loops and reduce the number of loop iterations.
 */
export class SendInLoop extends ASTDetector {
  severity = Severity.HIGH;

  async check(cu: CompilationUnit): Promise<MistiTactWarning[]> {
    const warnings: MistiTactWarning[] = [];
    this.collectWarnings(cu, warnings);
    return warnings;
  }

  /**
   * Collects warnings by traversing the AST of the compilation unit.
   */
  private collectWarnings(cu: CompilationUnit, warnings: MistiTactWarning[]): void {
    for (const node of cu.ast.getProgramEntries()) {
      foldStatements(
        node,
        (accumulatedWarnings, statement) => {
          this.analyzeStatement(statement, accumulatedWarnings);
          return accumulatedWarnings;
        },
        warnings,
      );
    }
  }

  /**
   * Analyzes a statement to detect issues.
   */
  private analyzeStatement(
    statement: AstStatement,
    warnings: MistiTactWarning[],
    inLoop: boolean = false,
  ): void {
    if (this.isLoopStatement(statement)) {
      this.handleLoopStatement(statement, warnings);
    } else if (this.isConditionalStatement(statement)) {
      this.handleConditionalStatement(statement, warnings, inLoop);
    } else if (this.isTryCatchStatement(statement)) {
      this.handleTryCatchStatement(statement, warnings, inLoop);
    } else if (statement.kind === "statement_expression") {
      this.handleExpressionStatement(statement as AstStatementExpression, warnings, inLoop);
    }
  }

  /**
   * Handles loop statements by analyzing their body statements and checking for potential issues.
   */
  private handleLoopStatement(statement: AstStatement, warnings: MistiTactWarning[]): void {
    this.checkForExcessiveIterations(statement, warnings);
    const loopStatements = this.getLoopBodyStatements(statement);
    for (const stmt of loopStatements) {
      this.analyzeStatement(stmt, warnings, true);
    }
  }

  /**
   * Checks for loops that may cause out-of-gas exceptions due to excessive iterations.
   */
  private checkForExcessiveIterations(statement: AstStatement, warnings: MistiTactWarning[]): void {
    if (statement.kind === "statement_repeat") {
      const repeatStmt = statement as AstStatementRepeat;
      const iterations = repeatStmt.iterations;
      if (iterations.kind === "number") {
        const value = (iterations as AstNumber).value;
        if (value > BigInt(1_000_000)) {
          warnings.push(
            this.makeWarning(
              `Loop with ${value} iterations may cause an out-of-gas exception`,
              iterations.loc,
              {
                suggestion: "Consider reducing the number of iterations.",
              },
            ),
          );
        }
      }
    } else if (statement.kind === "statement_while" || statement.kind === "statement_until") {
      const condition = (statement as AstStatementWhile | AstStatementUntil).condition;
      if (this.isConditionAlwaysTrue(condition)) {
        warnings.push(
          this.makeWarning(
            `Loop with condition that is always true may cause an out-of-gas exception`,
            condition.loc,
            {
              suggestion: "Ensure the loop has a valid termination condition.",
            },
          ),
        );
      }
    }
  }

  /**
   * Determines if a condition is always true.
   */
  private isConditionAlwaysTrue(condition: AstExpression): boolean {
    if (condition.kind === "boolean" && condition.value === true) {
      return true;
    }
    if (condition.kind === "id" && condition.text === "true") {
      return true;
    }
    return false;
  }

  /**
   * Handles conditional statements by analyzing their branches.
   */
  private handleConditionalStatement(
    statement: AstStatement,
    warnings: MistiTactWarning[],
    inLoop: boolean,
  ): void {
    const condition = statement as AstCondition;
    for (const stmt of condition.trueStatements) {
      this.analyzeStatement(stmt, warnings, inLoop);
    }
    if (condition.falseStatements) {
      for (const stmt of condition.falseStatements) {
        this.analyzeStatement(stmt, warnings, inLoop);
      }
    }
    if (condition.elseif) {
      this.analyzeStatement(condition.elseif, warnings, inLoop);
    }
  }

  /**
   * Handles try-catch statements by analyzing their try and catch blocks.
   */
  private handleTryCatchStatement(
    statement: AstStatement,
    warnings: MistiTactWarning[],
    inLoop: boolean,
  ): void {
    if (statement.kind === "statement_try") {
      const tryStmt = statement as AstStatementTry;
      for (const stmt of tryStmt.statements) {
        this.analyzeStatement(stmt, warnings, inLoop);
      }
    } else if (statement.kind === "statement_try_catch") {
      const tryCatchStmt = statement as AstStatementTryCatch;
      for (const stmt of tryCatchStmt.statements) {
        this.analyzeStatement(stmt, warnings, inLoop);
      }
      for (const stmt of tryCatchStmt.catchStatements) {
        this.analyzeStatement(stmt, warnings, inLoop);
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
  ): void {
    if (inLoop) {
      this.checkForSendFunctions(statement.expression, warnings);
    }
  }

  /**
   * Checks if an expression contains a send function call and records a warning.
   */
  private checkForSendFunctions(expr: AstExpression, warnings: MistiTactWarning[]): void {
    const functionName = this.extractFunctionName(expr);
    if (functionName && this.isSendFunction(functionName)) {
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
    }
  }

  /**
   * Extracts the function name from an expression if it is a function call.
   */
  private extractFunctionName(expr: AstExpression): string | null {
    if (expr.kind === "static_call" && expr.function.kind === "id") {
      return expr.function.text;
    } else if (expr.kind === "method_call" && expr.method.kind === "id") {
      return expr.method.text;
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
    return sendFunctions.includes(functionName);
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
