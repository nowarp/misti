"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MistiTactError = exports.Severity = void 0;
/**
 * Enumerates the levels of severity that can be assigned to detected findings.
 */
var Severity;
(function (Severity) {
    Severity[Severity["INFO"] = 0] = "INFO";
    Severity[Severity["LOW"] = 1] = "LOW";
    Severity[Severity["MEDIUM"] = 2] = "MEDIUM";
    Severity[Severity["HIGH"] = 3] = "HIGH";
    Severity[Severity["CRITICAL"] = 4] = "CRITICAL";
})(Severity = exports.Severity || (exports.Severity = {}));
/**
 * Error instance that refers to a specific place in a Tact contract.
 */
class MistiTactError extends Error {
    _severity;
    ref;
    constructor(msg, ref, _severity) {
        super(msg);
        this._severity = _severity;
        this.ref = ref;
    }
    /**
     * Gets the severity level of this error.
     * @returns The severity as defined by the Severity enum.
     */
    get severity() {
        return this._severity;
    }
}
exports.MistiTactError = MistiTactError;
