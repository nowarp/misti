type FileSystemNode = {
    type: 'file' | 'directory';
    content?: string;
    size?: number;
    createdAt?: Date;
    updatedAt?: Date;
};

export type FileSystemTree = Record<string, FileSystemNode>;

export type FileStat = {
    isFile: () => boolean;
    isDirectory: () => boolean;
    size: number;
    createdAt: Date;
    updatedAt: Date;
};

export type VirtualFileSystem = {
    root: string;
    resolve(...path: string[]): string;
    exists(path: string): boolean;
    readFile(path: string): Buffer;
    writeFile(path: string, content: Buffer | string): void;
    readdir: (path: string) => string[];
    stat: (path: string) => FileStat;
};
