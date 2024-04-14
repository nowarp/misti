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
exports.MistiConfig = exports.BUILTIN_DETECTORS = void 0;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const DetectorConfigSchema = zod_1.z.object({
    modulePath: zod_1.z.string().optional(),
    className: zod_1.z.string(),
});
const VerbositySchema = zod_1.z.enum(["quiet", "debug", "default"]);
const ConfigSchema = zod_1.z.object({
    detectors: zod_1.z.array(DetectorConfigSchema),
    ignored_projects: zod_1.z.array(zod_1.z.string()).optional(),
    verbosity: VerbositySchema.optional().default("default"),
});
/** Built-in detectors enabled by default, if no user configuration is provided. */
exports.BUILTIN_DETECTORS = [
    { className: "ReadOnlyVariables" },
];
/** Represents content of the Misti configuration file (misti.config.json). */
class MistiConfig {
    detectorsEnabled;
    ignoredProjects;
    verbosity;
    constructor(configPath) {
        let configData;
        if (configPath) {
            try {
                const configFileContents = fs.readFileSync(configPath, "utf8");
                configData = JSON.parse(configFileContents);
            }
            catch (err) {
                if (err instanceof Error) {
                    throw new Error(`Could not load or parse config file (${configPath}): ${err.message}`);
                }
                else {
                    throw err;
                }
            }
        }
        else {
            // Use default detectors if no config file is provided
            configData = {
                detectors: exports.BUILTIN_DETECTORS,
                ignored_projects: [],
                verbosity: "default",
            };
        }
        try {
            const parsedConfig = ConfigSchema.parse(configData);
            this.detectorsEnabled = parsedConfig.detectors;
            this.ignoredProjects = parsedConfig.ignored_projects || [];
            this.verbosity = parsedConfig.verbosity;
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                throw new Error(`Failed to initialize Config with provided data: ${err.message}`);
            }
            else {
                throw err;
            }
        }
    }
}
exports.MistiConfig = MistiConfig;
