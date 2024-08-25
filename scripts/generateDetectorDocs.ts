import {
  ClassDeclaration,
  SyntaxKind,
  Node,
  getJSDocCommentsAndTags,
  createSourceFile,
  ScriptTarget,
  isClassDeclaration,
  forEachChild,
} from "typescript";
import fs from "fs-extra";
import * as path from "path";

/**
 * Expose the internal TypeScript APIs used within the script.
 */
declare module "typescript" {
  // https://github.com/microsoft/TypeScript/blob/v4.9.3/src/compiler/utilities.ts#L2727
  export function getJSDocCommentsAndTags(
    hostNode: Node,
    noCache?: boolean,
  ): readonly (JSDoc | JSDocTag)[];
}

function extendsDetector(node: ClassDeclaration): boolean {
  if (!node.heritageClauses) {
    return false;
  }
  const extendsClause = node.heritageClauses.find(
    (clause) => clause.token === SyntaxKind.ExtendsKeyword,
  );
  if (!extendsClause) {
    return false;
  }
  return extendsClause.types.some(
    (type) => type.expression.getText() === "Detector",
  );
}

function getJSDocComments(node: Node): string {
  return getJSDocCommentsAndTags(node)
    .filter((jsdoc) => jsdoc.kind === SyntaxKind.JSDoc)
    .map((jsdoc) => jsdoc.comment)
    .join("\n");
}

function processFile(
  fileName: string,
): Array<[/*className:*/ string, /*markdown:*/ string]> {
  const sourceFile = createSourceFile(
    fileName,
    fs.readFileSync(fileName).toString(),
    ScriptTarget.Latest,
    true,
  );
  const results: Array<[string, string]> = [];
  function visit(node: Node) {
    if (isClassDeclaration(node) && extendsDetector(node)) {
      const className = node.name?.getText() || "Unknown Class";
      const docComment = getJSDocComments(node);

      const markdown = `# ${className}\n${docComment}\n`;
      results.push([className, markdown]);
    }
    forEachChild(node, visit);
  }
  visit(sourceFile);
  return results;
}

function processDirectory(
  directoryPath: string,
  outputDirectory: string,
): void {
  fs.readdirSync(directoryPath).forEach((file) => {
    const filePath = path.join(directoryPath, file);
    if (fs.statSync(filePath).isFile() && file.endsWith(".ts")) {
      processFile(filePath).forEach(([className, markdown]) => {
        const dest = path.join(outputDirectory, `${className}.md`);
        fs.outputFileSync(dest, markdown);
      });
    }
  });
}

const args = process.argv.slice(2);
let outputDirectory: string = ".";
const outputDirIndex = args.indexOf("--output-directory");
if (outputDirIndex !== -1 && outputDirIndex + 1 < args.length) {
  outputDirectory = args[outputDirIndex + 1];
}
const directoryPath = path.join(__dirname, "..", "src", "detectors", "builtin");
processDirectory(directoryPath, outputDirectory);
