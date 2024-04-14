"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findBuiltInDetector = exports.Detector = void 0;
const errors_1 = require("../internals/errors");
/**
 * Abstract base class for a detector module, providing an interface for defining various types of detectors.
 */
class Detector {
    /**
     * Constructs an error object with a description and the source code location.
     *
     * @param description Descriptive text of the error.
     * @param severity Severity of the finding.
     * @param ref Reference to the source code that includes file information and position data.
     * @returns A new MistiTactError containing the error message and source code reference.
     */
    createError(description, severity, ref) {
        const pos = ref.file
            ? (() => {
                const lc = ref.interval.getLineAndColumn();
                return `${ref.file}:${lc.lineNum}:${lc.colNum}: `;
            })()
            : "";
        const msg = `${pos}${description}`;
        return new errors_1.MistiTactError(msg, ref, severity);
    }
}
exports.Detector = Detector;
/**
 * A mapping of detector names to functions that load detector instances.
 * This allows for lazy loading of detectors, which may include importing necessary modules dynamically.
 */
const BuiltInDetectors = {
    ReadOnlyVariables: () => Promise.resolve().then(() => __importStar(require("./builtin/readOnlyVariables"))).then((module) => new module.ReadOnlyVariables()),
};
/**
 * Asynchronously retrieves a built-in detector by its name.
 * If the detector is found in the BuiltInDetectors registry, it is loaded and returned;
 * otherwise, a warning is logged and `undefined` is returned.
 *
 * @param ctx Misti context.
 * @param name The name of the detector to retrieve. This name must match a key in the BuiltInDetectors object.
 * @returns A Promise that resolves to a Detector instance or `undefined` if the detector cannot be found or fails to load.
 */
async function findBuiltInDetector(ctx, name) {
    const detectorLoader = BuiltInDetectors[name];
    if (!detectorLoader) {
        ctx.logger.warn(`Built-in detector ${name} not found.`);
        return undefined;
    }
    try {
        return await detectorLoader();
    }
    catch (error) {
        ctx.logger.error(`Error loading built-in detector ${name}: ${error}`);
        return undefined;
    }
}
exports.findBuiltInDetector = findBuiltInDetector;
