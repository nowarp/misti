import { ASTRef } from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Enumerates the levels of severity that can be assigned to detected findings.
 */
export enum Severity {
  INFO,
  LOW,
  MEDIUM,
  HIGH,
  CRITICAL,
}

/**
 * Error instance that refers to a specific place in a Tact contract.
 */
export class MistiTactError extends Error {
  readonly ref: ASTRef;
  constructor(
    msg: string,
    ref: ASTRef,
    private _severity: Severity,
  ) {
    super(msg);
    this.ref = ref;
  }

  /**
   * Gets the severity level of this error.
   * @returns The severity as defined by the Severity enum.
   */
  get severity(): Severity {
    return this._severity;
  }
}
