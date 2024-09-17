import { CompilationUnit } from "./ir";
import JSONbig from "json-bigint";

/**
 * Generates AST dump in the JSON format.
 */
export class ASTDumper {
  /**
   * Generates an AST dump in JSON for the given CompilationUnit.
   * @param cu The compilation unit to be dumped.
   * @param dumpStdlib If true, the standard library definitions will be included in the dump.
   */
  public static dumpCU(cu: CompilationUnit, dumpStdlib: boolean): string {
    return JSONbig.stringify(cu.ast.getProgramEntries(dumpStdlib), null, 2);
  }
}
