import { DetectorKind } from "../src/detectors/detector";
import { Severity, parseSeverity, severityToString } from "../src/internals/warnings";
import { PropertyDeclaration } from "typescript";
import {
  ClassDeclaration,
  SyntaxKind,
  Node,
  getJSDocCommentsAndTags,
  ScriptTarget,
  isClassDeclaration,
  forEachChild,
  Program,
  createProgram,
  TypeChecker,
  isGetAccessorDeclaration,
  ReturnStatement,
  StringLiteral,
} from "typescript";
import fs from "fs-extra";
import * as path from "path";
import { BuiltInDetectors } from "../src/detectors/detector";

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

type DetectorDoc = {
  className: string;
  kind: DetectorKind;
  severity: Severity;
  markdown: string;
  enabledByDefault: boolean;
};

export function extendsDetector(
  node: ClassDeclaration,
  checker: TypeChecker,
): boolean {
  const symbol = checker.getSymbolAtLocation(node.name!);
  if (!symbol) {
    return false;
  }
  const classType = checker.getDeclaredTypeOfSymbol(symbol);

  function isDetectorType(type: any): boolean {
    if (!type || !type.symbol) {
      return false;
    }
    const typeName = checker.getFullyQualifiedName(type.symbol);
    if (typeName.endsWith("Detector")) {
      return true;
    }
    const baseTypes = type.getBaseTypes();
    if (!baseTypes || baseTypes.length === 0) {
      return false;
    }
    return baseTypes.some((baseType: any) => isDetectorType(baseType));
  }

  return isDetectorType(classType);
}

export function getJSDocComments(node: Node): string {
  return getJSDocCommentsAndTags(node)
    .filter((jsdoc) => jsdoc.kind === SyntaxKind.JSDoc)
    .map((jsdoc) => jsdoc.comment)
    .join("\n");
}

function extractKindValue(
  node: ClassDeclaration,
  checker: TypeChecker,
): DetectorKind | undefined {
  // Find the 'kind' getter in the class
  for (const member of node.members) {
    if (isGetAccessorDeclaration(member) && member.name.getText() === "kind") {
      // Try to extract the return value
      if (member.body && member.body.statements.length > 0) {
        const returnStatement = member.body.statements.find(
          (stmt): stmt is ReturnStatement =>
            stmt.kind === SyntaxKind.ReturnStatement,
        );
        if (
          returnStatement &&
          returnStatement.expression &&
          returnStatement.expression.kind === SyntaxKind.StringLiteral
        ) {
          const kindValue = (returnStatement.expression as StringLiteral).text;
          return kindValue as DetectorKind;
        }
      }
    }
  }
  // If 'kind' is not defined in the class, try to get it from the base class
  const symbol = checker.getSymbolAtLocation(node.name!);
  if (symbol) {
    const classType = checker.getDeclaredTypeOfSymbol(symbol);
    const baseTypes = classType.getBaseTypes();
    if (baseTypes && baseTypes.length > 0) {
      // Assume single inheritance
      const baseType = baseTypes[0];
      const declaration = baseType.symbol.valueDeclaration;
      if (declaration && isClassDeclaration(declaration)) {
        return extractKindValue(declaration, checker);
      }
    }
  }
  return undefined;
}

function extractSeverityValue(node: ClassDeclaration): Severity {
  for (const member of node.members) {
    if (
      member.kind === SyntaxKind.PropertyDeclaration &&
      (member as PropertyDeclaration).name.getText() === "severity"
    ) {
      const propertyDeclaration = member as PropertyDeclaration;
      if (propertyDeclaration.initializer) {
        const severityValue = propertyDeclaration.initializer
          .getText()
          .split(".")[1];
        return parseSeverity(severityValue);
      }
    }
  }
  throw new Error(`Severity not found for detector ${node.name?.getText()}`);
}

export function processFile(
  fileName: string,
  program: Program,
): Array<DetectorDoc> {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    return [];
  }
  const checker = program.getTypeChecker();
  const results: Array<DetectorDoc> = [];

  function visit(node: Node) {
    if (isClassDeclaration(node) && node.name) {
      if (extendsDetector(node, checker)) {
        const className = node.name.getText();
        const docComment = getJSDocComments(node);
        const kind = extractKindValue(node, checker)!;
        const severity = extractSeverityValue(node);
        const enabledByDefault = BuiltInDetectors[className]?.enabledByDefault ?? false;

        const markdown = `# ${className}\n${docComment}\n`;
        results.push({ className, markdown, kind, severity, enabledByDefault });
      }
    }
    forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function processDirectory(
  directoryPath: string,
  outputDirectory: string,
): void {
  const fileNames = fs
    .readdirSync(directoryPath)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.join(directoryPath, file));

  const program = createProgram(fileNames, {
    target: ScriptTarget.Latest,
    module: 1, // CommonJS
  });

  console.log("| #  | Detector | Severity | Requires Soufflé | Enabled by default |");
  console.log("|----|-----------|-----------|--------------------|---------------------|");

  fileNames.forEach((fileName, index) => {
    processFile(fileName, program).forEach(
      ({ className, markdown, kind, severity, enabledByDefault }) => {
        const markdownPath = `${className}.md`;
        const dest = path.join(outputDirectory, markdownPath);

        const requiresSouffle = kind === "souffle" ? "✔" : "";
        const enabledByDefaultStr = enabledByDefault ? "✔" : "";
        console.log(
          `| ${index + 1}  | [${className}](./detectors/${markdownPath}) | ${capitalize(severityToString(severity, { brackets: false }))} | ${requiresSouffle} | ${enabledByDefaultStr} |`
        );

        fs.outputFileSync(dest, markdown);
      },
    );
  });
}

const args = process.argv.slice(2);
let outputDirectory: string = "/tmp";
const outputDirIndex = args.indexOf("-o");
if (outputDirIndex !== -1 && outputDirIndex + 1 < args.length) {
  outputDirectory = args[outputDirIndex + 1];
}
const directoryPath = path.join(__dirname, "..", "src", "detectors", "builtin");
processDirectory(directoryPath, outputDirectory);
