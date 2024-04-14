interface DetectorConfig {
    modulePath?: string;
    className: string;
}
/** Built-in detectors enabled by default, if no user configuration is provided. */
export declare const BUILTIN_DETECTORS: DetectorConfig[];
/** Represents content of the Misti configuration file (misti.config.json). */
export declare class MistiConfig {
    detectorsEnabled: DetectorConfig[];
    ignoredProjects: string[];
    verbosity: "quiet" | "debug" | "default";
    constructor(configPath?: string);
}
export {};
