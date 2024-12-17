import { FileStat, FileSystemTree, VirtualFileSystem } from "./virtualFileSystem";
import path from "path";

/**
 * Creates a virtual file system for managing files only (no directories).
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
        root: normalizedRoot,

        exists(filePath: string): boolean {
            const resolvedPath = this.resolve(filePath);
            return resolvedPath in memoryFS;
        },

        resolve(...filePath: string[]): string {
            return path.normalize(path.resolve(normalizedRoot, ...filePath));
        },

        readFile(filePath: string): Buffer {
            const resolvedPath = this.resolve(filePath);
            const file = memoryFS[resolvedPath];

            if (!file || file.type !== "file") {
                throw new Error(`File '${resolvedPath}' does not exist or is not a file`);
            }

            const content = file.content ?? ""; // Default to an empty string if content is undefined
            return Buffer.from(content, "utf-8");
        },

        writeFile(filePath: string, content: Buffer | string): void {
            if (readonly) {
                throw new Error("File system is readonly");
            }
            const resolvedPath = this.resolve(filePath);

            // Write the file
            memoryFS[resolvedPath] = {
                type: "file",
                content: content.toString(),
                size: typeof content === "string" ? Buffer.byteLength(content) : content.length,
                createdAt: memoryFS[resolvedPath]?.createdAt || new Date(),
                updatedAt: new Date(),
            };
        },

        readdir(): string[] {
            // List all file names in the memory file system
            return Object.keys(memoryFS).filter((key) => memoryFS[key].type === "file");
        },

        stat(filePath: string): FileStat {
            const resolvedPath = this.resolve(filePath);
            const node = memoryFS[resolvedPath];

            if (!node) {
                throw new Error(`File '${resolvedPath}' does not exist`);
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
