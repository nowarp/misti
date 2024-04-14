import { ASTRef } from "@tact-lang/compiler/dist/grammar/ast";
/**
 * Enumerates the levels of severity that can be assigned to detected findings.
 */
export declare enum Severity {
    INFO = 0,
    LOW = 1,
    MEDIUM = 2,
    HIGH = 3,
    CRITICAL = 4
}
/**
 * Error instance that refers to a specific place in a Tact contract.
 */
export declare class MistiTactError extends Error {
    private _severity;
    readonly ref: ASTRef;
    constructor(msg: string, ref: ASTRef, _severity: Severity);
    /**
     * Gets the severity level of this error.
     * @returns The severity as defined by the Severity enum.
     */
    get severity(): Severity;
}
