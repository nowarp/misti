import { VirtualFileSystem, FileStat } from "./virtualFileSystem";
import { InternalException } from "../internals/exceptions";
import fs from "fs";
import path from "path";

/**
 * Creates a Virtual File System backed by the local file system.
 * This file system interacts directly with the host's disk storage.
 *
 * @param root - The root directory for the virtual file system.
 * @param readonly - If true, prevents write operations. Default is true.
 * @returns A VirtualFileSystem instance with local file system operations.
 */
export function createNodeFileSystem(
  root: string,
  readonly: boolean = true,
): VirtualFileSystem {
  let normalizedRoot = path.normalize(root);
  if (!normalizedRoot.endsWith(path.sep)) {
    normalizedRoot += path.sep;
  }

  return {
    /**
     * The normalized root directory for the virtual file system.
     */
    root: normalizedRoot,

    /**
     * The type of the virtual file system. In this case, it is "local".
     */
    type: "local",

    /**
     * Checks if a file or directory exists at the specified path.
     *
     * @param filePath - The path to check existence for.
     * @returns True if the file or directory exists, otherwise false.
     */
    exists(filePath: string): boolean {
      const resolvedPath = this.resolve(filePath);
      return fs.existsSync(resolvedPath);
    },

    /**
     * Resolves a given path to an absolute path within the virtual file system's root.
     *
     * @param filePath - One or more path segments to resolve.
     * @returns The resolved absolute path.
     */
    resolve(...filePath: string[]): string {
      return path.normalize(path.resolve(normalizedRoot, ...filePath));
    },

    /**
     * Reads a file from the virtual file system.
     *
     * @param filePath - The path of the file to read.
     * @returns A Buffer containing the file's content.
     */
    readFile(filePath: string): Buffer {
      const resolvedPath = this.resolve(filePath);
      return fs.readFileSync(resolvedPath);
    },

    /**
     * Writes content to a file in the virtual file system.
     * Creates necessary directories if they do not exist.
     *
     * @param filePath - The path of the file to write to.
     * @param content - The content to write, as a Buffer or string.
     * @throws An exception if the file system is in readonly mode.
     */
    writeFile(filePath: string, content: Buffer | string): void {
      if (readonly) {
        throw InternalException.make(
          `Cannot write to file "${filePath}": The file system is in readonly mode.`,
        );
      }
      const resolvedPath = this.resolve(filePath);
      // Ensure the directory exists
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(resolvedPath, content);
    },

    /**
     * Reads the contents of a directory in the virtual file system.
     *
     * @param dirPath - The path of the directory to read.
     * @returns An array of filenames in the directory.
     * @throws An error if the specified path is not a directory.
     */
    readdir(dirPath: string): string[] {
      const resolvedPath = this.resolve(dirPath);
      if (!fs.statSync(resolvedPath).isDirectory()) {
        throw InternalException.make(
          `Path '${resolvedPath}' is not a directory`,
        );
      }
      return fs.readdirSync(resolvedPath);
    },

    /**
     * Retrieves the statistics of a file or directory.
     *
     * @param filePath - The path of the file or directory.
     * @returns An object containing file/directory metadata.
     */
    stat(filePath: string): FileStat {
      const resolvedPath = this.resolve(filePath);
      const stats = fs.statSync(resolvedPath);

      return {
        isFile: () => stats.isFile(),
        isDirectory: () => stats.isDirectory(),
        size: stats.size,
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
      };
    },
  };
}
