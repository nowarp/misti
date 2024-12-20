type FileNode = {
  type: "file";
  content: string;
  size?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

type DirectoryNode = {
  type: "directory";
  size?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

type FileSystemNode = FileNode | DirectoryNode;

export type FileSystemTree = Record<string, FileSystemNode>;

export type FileStat = {
  isFile: () => boolean;
  isDirectory: () => boolean;
  size: number;
  createdAt: Date;
  updatedAt: Date;
};

type FileSystemBackend = "local" | "inMemory";

export type VirtualFileSystem = {
  root: string;
  type: FileSystemBackend;
  resolve(...path: string[]): string;
  exists(path: string): boolean;
  readFile(path: string): Buffer;
  writeFile(path: string, content: Buffer | string): void;
  readdir: (path: string) => string[];
  stat: (path: string) => FileStat;
};
