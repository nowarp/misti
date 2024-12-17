import { VirtualFileSystem, FileStat } from "./virtualFileSystem";
import fs from "fs";
import path from "path";

export function createNodeFileSystem(
  root: string,
  readonly: boolean = true,
): VirtualFileSystem {
  let normalizedRoot = path.normalize(root);
  if (!normalizedRoot.endsWith(path.sep)) {
    normalizedRoot += path.sep;
  }

  return {
    root: normalizedRoot,
    type: "node",

    exists(filePath: string): boolean {
      const resolvedPath = this.resolve(filePath);
      return fs.existsSync(resolvedPath);
    },

    resolve(...filePath: string[]): string {
      return path.normalize(path.resolve(normalizedRoot, ...filePath));
    },

    readFile(filePath: string): Buffer {
      const resolvedPath = this.resolve(filePath);
      return fs.readFileSync(resolvedPath);
    },

    writeFile(filePath: string, content: Buffer | string): void {
      if (readonly) {
        throw new Error("File system is readonly");
      }
      const resolvedPath = this.resolve(filePath);
      // Ensure the directory exists
      const dir = path.dirname(resolvedPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedPath, content);
    },

    readdir(dirPath: string): string[] {
      const resolvedPath = this.resolve(dirPath);
      if (!fs.statSync(resolvedPath).isDirectory()) {
        throw new Error(`Path '${resolvedPath}' is not a directory`);
      }
      return fs.readdirSync(resolvedPath);
    },

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
