import { DetectorKind } from "../src/detectors/detector";
import {
  Severity,
  parseSeverity,
  severityToString,
  Category,
  categoryToString,
} from "../src/internals/warnings";
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
  severity: { min: Severity; max: Severity };
  categories: Category[] | undefined;
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

function parseMinMax(input: string): { min: string; max: string } | undefined {
  const regex = /{\s*min:\s*Severity\.(\w+),\s*max:\s*Severity\.(\w+)\s*}/;
  const match = input.match(regex);
  return match ? { min: match[1], max: match[2] } : undefined;
}

function extractSeverityValue(node: ClassDeclaration): {
  min: Severity;
  max: Severity;
} {
  for (const member of node.members) {
    if (
      member.kind === SyntaxKind.PropertyDeclaration &&
      (member as PropertyDeclaration).name.getText() === "severity"
    ) {
      const propertyDeclaration = member as PropertyDeclaration;
      if (propertyDeclaration.initializer) {
        const initText = propertyDeclaration.initializer.getText();
        const result = parseMinMax(initText);
        if (result) {
          return {
            min: parseSeverity(result.min),
            max: parseSeverity(result.max),
          };
        } else {
          const severityValue = propertyDeclaration.initializer
            .getText()
            .split(".")[1];
          const value = parseSeverity(severityValue);
          return { min: value, max: value };
        }
      }
    }
  }
  throw new Error(`Severity not found for detector ${node.name?.getText()}`);
}

function extractCategoryValue(node: ClassDeclaration): Category[] | undefined {
  for (const member of node.members) {
    if (
      member.kind === SyntaxKind.PropertyDeclaration &&
      (member as PropertyDeclaration).name.getText() === "category"
    ) {
      const propertyDeclaration = member as PropertyDeclaration;
      if (propertyDeclaration.initializer) {
        const initText = propertyDeclaration.initializer.getText();
        // Handle array of categories
        if (initText.startsWith("[")) {
          const categoryValues = initText
            .replace(/\[|\]/g, "")
            .split(",")
            .map((c) => c.trim().split(".")[1]);
          return categoryValues.map(
            (c) => Category[c as keyof typeof Category],
          );
        }
        // Handle single category
        else {
          const categoryValue = propertyDeclaration.initializer
            .getText()
            .split(".")[1];
          return [Category[categoryValue as keyof typeof Category]];
        }
      }
    }
  }
  return undefined;
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
        const categories = extractCategoryValue(node);
        const enabledByDefault =
          BuiltInDetectors[className]?.enabledByDefault ?? false;

        const severityStr = (() => {
          const { min, max } = severity;
          const fmt = (s: Severity) =>
            capitalize(severityToString(s, { brackets: false }));
          return min === max ? fmt(min) : `${fmt(min)}—${fmt(max)}`;
        })();

        const categoryStr = (() => {
          if (!categories) return "Uncategorized";
          return Array.isArray(categories)
            ? categories.map((c) => categoryToString(c)).join(", ")
            : categoryToString(categories);
        })();

        const markdown = `# ${className}\n**Severity**: ${severityStr} | **Category**: ${categoryStr}\n\n${docComment}\n`;

        results.push({
          className,
          markdown,
          kind,
          severity,
          categories,
          enabledByDefault,
        });
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

  console.log(
    "| #  | Detector | Severity | Category | Requires Soufflé | Enabled by default |",
  );
  console.log(
    "|----|----------|----------|----------|------------------|--------------------|",
  );
  fileNames.forEach((fileName, idx) => {
    processFile(fileName, program).forEach(
      ({
        className,
        markdown,
        kind,
        severity,
        categories: category,
        enabledByDefault,
      }) => {
        const markdownPath = `${className}.md`;
        const dest = path.join(outputDirectory, markdownPath);
        const requiresSouffle = kind === "souffle" ? "✔" : "";
        const enabledByDefaultStr = enabledByDefault ? "✔" : "";
        const severityStr = (() => {
          const { min, max } = severity;
          const fmt = (s: Severity) =>
            capitalize(severityToString(s, { brackets: false }));
          return min === max ? fmt(min) : `${fmt(min)}—${fmt(max)}`;
        })();
        const categoryStr = (() => {
          if (!category) return "";
          return Array.isArray(category)
            ? category.map((c) => categoryToString(c)).join(", ")
            : categoryToString(category);
        })();
        console.log(
          `| ${idx + 1}  | [${className}](./detectors/${markdownPath}) | ${severityStr} | ${categoryStr} | ${requiresSouffle} | ${enabledByDefaultStr} |`,
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
