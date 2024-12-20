import {
  FileStat,
  FileSystemTree,
  VirtualFileSystem,
} from "./virtualFileSystem";
import { InternalException } from "../internals/exceptions";
import path from "path";

/**
 * Creates a virtual file system for managing files only (no directories).
 * This file system is entirely in-memory and does not interact with the host file system.
 *
 * @param root - The root directory for the virtual file system.
 * @param fileSystemTree - The initial structure of the in-memory file system. Default is an empty object.
 * @param readonly - If true, prevents write operations. Default is true.
 * @returns A VirtualFileSystem instance for managing in-memory files.
 */
export function createVirtualFileSystem(
  root: string,
  fileSystemTree: FileSystemTree = {},
  readonly: boolean = true,
): VirtualFileSystem {
  let normalizedRoot = path.normalize(root);
  if (!normalizedRoot.endsWith(path.sep)) {
    normalizedRoot += path.sep;
  }

  const memoryFS = fileSystemTree;

  return {
    /**
     * The normalized root directory for the virtual file system.
     */
    root: normalizedRoot,

    /**
     * The type of the virtual file system. In this case, it is "inMemory".
     */
    type: "inMemory",

    /**
     * Checks if a file exists at the specified path.
     *
     * @param filePath - The path to check existence for.
     * @returns True if the file exists, otherwise false.
     */
    exists(filePath: string): boolean {
      const resolvedPath = this.resolve(filePath);
      return resolvedPath in memoryFS;
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
     * @throws An error if the file does not exist or is not a file.
     */
    readFile(filePath: string): Buffer {
      const resolvedPath = this.resolve(filePath);
      const file = memoryFS[resolvedPath];

      if (!file || file.type !== "file") {
        throw InternalException.make(
          `File '${resolvedPath}' does not exist or is not a file`,
        );
      }

      return Buffer.from(file.content, "utf-8");
    },

    /**
     * Writes content to a file in the virtual file system.
     *
     * @param filePath - The path of the file to write to.
     * @param content - The content to write, as a Buffer or string.
     * @throws An error if the file system is in readonly mode.
     */
    writeFile(filePath: string, content: Buffer | string): void {
      if (readonly) {
        throw InternalException.make(
          `Cannot write to file "${filePath}": The file system is in readonly mode.`,
        );
      }
      const resolvedPath = this.resolve(filePath);

      // Write the file
      memoryFS[resolvedPath] = {
        type: "file",
        content: content.toString(),
        size:
          typeof content === "string"
            ? Buffer.byteLength(content)
            : content.length,
        createdAt: memoryFS[resolvedPath]?.createdAt || new Date(),
        updatedAt: new Date(),
      };
    },

    /**
     * Lists all file names in the virtual file system.
     *
     * @returns An array of file names.
     */
    readdir(): string[] {
      // List all file names in the memory file system
      return Object.keys(memoryFS).filter(
        (key) => memoryFS[key].type === "file",
      );
    },

    /**
     * Retrieves the statistics of a file.
     *
     * @param filePath - The path of the file.
     * @returns An object containing file metadata such as size, creation date, and update date.
     * @throws An error if the file does not exist.
     */
    stat(filePath: string): FileStat {
      const resolvedPath = this.resolve(filePath);
      const node = memoryFS[resolvedPath];

      if (!node) {
        throw InternalException.make(`File '${resolvedPath}' does not exist`);
      }

      return {
        isFile: () => node.type === "file",
        isDirectory: () => false, // No directories in this implementation
        size: node.size ?? 0,
        createdAt: node.createdAt ?? new Date(),
        updatedAt: node.updatedAt ?? new Date(),
      };
    },
  };
}
