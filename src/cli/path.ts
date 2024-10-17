import { unreachable } from "../internals/util";
import path from "path";

/**
 * Path to a Tact contract or configuration provided by the user.
 */
export type MistiTactPath =
  | {
      kind: "config";
      /**
       * Absolute path to the tact.config.json.
       */
      path: string;
    }
  | {
      kind: "contract";
      /**
       * A path to a temporary configuration file generated internally in Misti (absolute).
       */
      tempConfigPath: string;
      /**
       * A path to the contract as it was specified by the user (absolute).
       */
      originalPath: string;
    };

/**
 * Returns path to a contract or configuration file as it is provided by the user.
 */
export function getOriginalPath(path: MistiTactPath): string {
  switch (path.kind) {
    case "config":
      return path.path;
    case "contract":
      return path.originalPath;
    default:
      unreachable(path);
  }
}

/**
 * Returns an actual path to a configuration file used in Misti.
 */
export function getActualPath(path: MistiTactPath): string {
  switch (path.kind) {
    case "config":
      return path.path;
    case "contract":
      return path.tempConfigPath;
    default:
      unreachable(path);
  }
}

/**
 * Returns an absolute path to an actual project directory used by Misti.
 */
export function getProjectDirectory(tactPath: MistiTactPath): string {
  return path.dirname(getActualPath(tactPath));
}
