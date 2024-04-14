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
exports.run = exports.Driver = void 0;
const context_1 = require("./internals/context");
const tactIRBuilder_1 = require("./internals/tactIRBuilder");
const detector_1 = require("./detectors/detector");
/**
 * Manages the initialization and execution of detectors for analyzing compilation units.
 */
class Driver {
    tactConfigPath;
    ctx;
    detectors = [];
    constructor(tactConfigPath, mistiConfigPath) {
        this.tactConfigPath = tactConfigPath;
        this.ctx = new context_1.MistiContext(mistiConfigPath);
        this.initializeDetectors();
    }
    /**
     * Executes checks on all compilation units and reports found errors sorted by severity.
     * @returns True if any errors were found, otherwise false.
     */
    async execute() {
        const cus = (0, tactIRBuilder_1.createIR)(this.ctx, this.tactConfigPath);
        return Array.from(cus.entries()).reduce((foundErrors, [projectName, cu]) => {
            this.ctx.logger.debug(`Checking ${projectName}...`);
            const thisCUErrors = this.checkCU(cu);
            thisCUErrors.sort((a, b) => b.severity - a.severity);
            thisCUErrors.forEach((error) => {
                this.reportError(error);
                foundErrors = true;
            });
            return foundErrors;
        }, false);
    }
    /**
     * Initializes all detectors specified in the configuration including external and built-in detectors.
     * @throws Error if a detector class cannot be found in the specified module or as a built-in.
     */
    async initializeDetectors() {
        const detectorPromises = this.ctx.config.detectorsEnabled.map(async (config) => {
            var _a;
            if (config.modulePath) {
                // Dynamic import for external detectors
                const module = await (_a = config.modulePath, Promise.resolve().then(() => __importStar(require(_a))));
                const DetectorClass = module[config.className];
                if (!DetectorClass) {
                    throw new Error(`Detector class ${config.className} not found in module ${config.modulePath}`);
                }
                return new DetectorClass();
            }
            else {
                // Attempt to find a built-in detector
                const detector = await (0, detector_1.findBuiltInDetector)(this.ctx, config.className);
                if (!detector) {
                    throw new Error(`Built-in detector ${config.className} not found`);
                }
                return detector;
            }
        });
        // Wait for all detectors to be initialized
        this.detectors = await Promise.all(detectorPromises);
    }
    /**
     * Logs a error to the standard error stream.
     * @param error The error object to report.
     */
    reportError(error) {
        this.ctx.logger.error(`${error.message}`);
    }
    /**
     * Executes all detectors on a given compilation unit and collects any errors found.
     * @param cu The compilation unit to check.
     * @returns An array of errors gathered from all detectors.
     */
    checkCU(cu) {
        return this.detectors.reduce((foundErrors, detector) => {
            this.ctx.logger.debug(`Running ${detector.constructor.name}...`);
            return foundErrors.concat(detector.check(this.ctx, cu));
        }, []);
    }
}
exports.Driver = Driver;
/**
 * Entry point of code analysis.
 * @param tactConfig - Path to Tact project configuration
 * @param mistiConfig - Path to Misti configuration file
 * @return true if detected any problems
 */
async function run(tactConfig, mistiConfig = undefined) {
    try {
        const driver = new Driver(tactConfig, mistiConfig);
        return await driver.execute();
    }
    catch (err) {
        if (err instanceof Error) {
            console.error(err.message);
            return true;
        }
        else {
            throw err;
        }
    }
}
exports.run = run;
