import { ExecutionException, tryMsg } from "../internals/exceptions";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Encapsulates logic of handling single Tact contracts without user-defined configuration.
 */
export class SingleContractProjectManager {
  /**
   * Path to the created temporary directory.
   */
  private tempDirPath: string;

  private constructor(private contractPath: string) {
    this.tempDirPath = this.createTempDir();
  }

  static fromContractPath(contractPath: string): SingleContractProjectManager {
    return new SingleContractProjectManager(contractPath);
  }

  /**
   * Cleans up the created temporary directory structure.
   * This method should be called after using this class.
   */
  public cleanup(): void {
    try {
      if (fs.existsSync(this.tempDirPath)) {
        fs.rmSync(this.tempDirPath, { recursive: true, force: true });
      }
    } catch (_) {}
  }

  /**
   * Creates a temporary project directory containing the Tact configuration file and contract.
   * @param copyAll If true, copies all .tact and .fc files to the temporary directory;
   *                otherwise, copies only the main contract file.
   * @returns Path to the created Tact project configuration.
   */
  public createTempProjectDir(copyAll = true): string {
    const contractDir = path.dirname(this.contractPath);
    const contractName = this.extractContractName();
    const rootDir = this.findRootDir(contractDir);

    let relativeContractPath: string;

    if (rootDir) {
      this.copyContractFiles(copyAll, this.contractPath, rootDir);
      relativeContractPath = path.join(
        "./",
        path.relative(rootDir, this.contractPath),
      );
    } else {
      this.copyContractFiles(copyAll, this.contractPath, null);
      relativeContractPath = `./${path.basename(this.contractPath)}`;
    }

    const configPath = path.join(this.tempDirPath, "tact.config.json");
    this.createConfig(configPath, relativeContractPath, contractName);

    return configPath;
  }

  /**
   * Copies contract files to the temporary directory.
   * @param copyAll If true, copies all .tact and .fc files; otherwise, copies only the main contract file.
   * @param srcPath Path to the source contract file.
   * @param rootDir Root directory containing .git or node_modules, or null if not found.
   */
  private copyContractFiles(
    copyAll: boolean,
    srcPath: string,
    rootDir: string | null,
  ): void {
    if (copyAll) {
      const sourceDir = rootDir || path.dirname(srcPath);
      this.copyFiles(sourceDir, sourceDir);
    } else {
      let destPath: string;
      if (rootDir) {
        const relativePath = path.relative(rootDir, srcPath);
        destPath = path.join(this.tempDirPath, relativePath);
        const destDirPath = path.dirname(destPath);
        if (!fs.existsSync(destDirPath)) {
          fs.mkdirSync(destDirPath, { recursive: true });
        }
      } else {
        destPath = path.join(this.tempDirPath, path.basename(srcPath));
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }

  /**
   * Recursively copies .tact and .fc files from the source directory to the temporary
   * directory, preserving directory structure relative to the root directory.
   * @param srcDir Source directory to copy files from.
   * @param rootDir Root directory to calculate relative paths.
   */
  private copyFiles(srcDir: string, rootDir: string): void {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const relativePath = path.relative(rootDir, srcPath);
      const destPath = path.join(this.tempDirPath, relativePath);

      if (entry.isDirectory()) {
        this.copyFiles(srcPath, rootDir);
      } else if (entry.isFile()) {
        if ([".tact", ".fc"].includes(path.extname(entry.name))) {
          const destDirPath = path.dirname(destPath);
          if (!fs.existsSync(destDirPath)) {
            fs.mkdirSync(destDirPath, { recursive: true });
          }
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  /**
   * Creates a Tact project configuration file in the temporary directory.
   * @param configPath - Path to the configuration file.
   * @param relativeContractPath - Relative path to the contract file from the configuration file.
   * @param contractName - Name of the contract.
   */
  private createConfig(
    configPath: string,
    relativeContractPath: string,
    contractName: string,
  ): void {
    const config = {
      projects: [
        {
          name: contractName,
          path: relativeContractPath,
          output: "./output",
          options: {
            external: true,
          },
        },
      ],
    };

    tryMsg(
      () => fs.writeFileSync(configPath, JSON.stringify(config), "utf8"),
      `Cannot create a default project configuration at ${configPath}`,
    );
  }

  /**
   * Finds the root directory containing .git or node_modules by searching upwards from the starting directory.
   * @param startingDir Directory to start searching from.
   * @returns Path to the root directory if found; otherwise, null.
   */
  private findRootDir(startingDir: string): string | null {
    let currentDir = startingDir;
    while (true) {
      if (
        fs.existsSync(path.join(currentDir, ".git")) ||
        fs.existsSync(path.join(currentDir, "node_modules"))
      ) {
        return currentDir;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        return null; // reached fs root
      }
      currentDir = parentDir;
    }
  }

  /**
   * Extracts the contract name from the contract path.
   * @returns The contract name.
   * @throws ExecutionException if the contract path is invalid.
   */
  private extractContractName(): string | never {
    const fileName = path.basename(this.contractPath);
    if (!fileName) {
      throw ExecutionException.make(
        `Invalid contract path: ${this.contractPath}`,
      );
    }
    return fileName.replace(/\.[^/.]+$/, "");
  }

  /**
   * Creates a temporary directory for the single contract project configuration.
   *
   * @throws If the temporary directory already exists and not empty.
   * @returns Path to the created temporary directory.
   */
  private createTempDir(): string {
    const baseDir = path.join(os.tmpdir(), "misti");
    fs.mkdirSync(baseDir, { recursive: true });
    const tempDirPrefix = path.join(baseDir, "temp-");
    const temp = fs.mkdtempSync(tempDirPrefix);
    if (fs.existsSync(temp) && fs.readdirSync(temp).length > 0) {
      throw ExecutionException.make(
        `Temporary directory is not empty: ${temp}`,
      );
    }
    return temp;
  }
}
