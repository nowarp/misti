import * as ts from "typescript";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { mkdtempSync } from "fs";
import { extendsDetector } from "./generateDetectorDocs";

describe("Script Functionality Tests", () => {
  test("extendsDetector identifies direct inheritance", () => {
    const code = `
      class Detector {}
      class MyDetector extends Detector {}
    `;
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "test-"));
    const filePath = path.join(tmpDir, "test.ts");
    fs.writeFileSync(filePath, code);

    const program = ts.createProgram([filePath], {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.CommonJS,
    });
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(filePath)!;
    const classNode = sourceFile.statements.find(
      (stmt): stmt is ts.ClassDeclaration =>
        ts.isClassDeclaration(stmt) && stmt.name?.text === "MyDetector",
    )!;
    const result = extendsDetector(classNode, checker);
    expect(result).toBe(true);
  });
});
