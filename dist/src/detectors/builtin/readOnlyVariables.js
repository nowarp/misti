"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadOnlyVariables = void 0;
const detector_1 = require("../detector");
/**
 * A detector that identifies read-only variables and fields.
 *
 * These variables could typically be replaced with constants to optimize performance.
 * Alternatively, identifying read-only variables may reveal issues where unused values are being replaced unintentionally.
 */
class ReadOnlyVariables extends detector_1.Detector {
    get id() {
        return "ROV";
    }
    check(ctx, _cu) {
        ctx.logger.info("Checking for read-only variables...");
        return []; // TODO
    }
}
exports.ReadOnlyVariables = ReadOnlyVariables;
