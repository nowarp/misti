import { Logger } from "./logger";
import { MistiConfig } from "./config";
/**
 * Represents the context for a Misti run.
 */
export declare class MistiContext {
    logger: Logger;
    config: MistiConfig;
    /**
     * Initializes the context for Misti, setting up configuration and appropriate logger.
     * @param mistiConfigPath Path to the Misti configuration file.
     */
    constructor(mistiConfigPath?: string);
}
