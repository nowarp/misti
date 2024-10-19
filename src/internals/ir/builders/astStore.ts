import { TactASTStore } from "..";
import { MistiContext } from "../../context";
import { definedInStdlib } from "../../tact/stdlib";
import { unreachable } from "../../util";
import {
  AstAsmFunctionDef,
  AstConstantDef,
  AstContract,
  AstContractInit,
  AstFunctionDef,
  AstMessageDecl,
  AstNativeFunctionDecl,
  AstPrimitiveTypeDecl,
  AstReceiver,
  AstStatement,
  AstStructDecl,
  AstTrait,
  AstTypeDecl,
  SrcInfo,
} from "@tact-lang/compiler/dist/grammar/ast";
import { AstStore } from "@tact-lang/compiler/dist/grammar/store";

/**
 * Transforms AstStore to TactASTStore.
 */
export class TactASTStoreBuilder {
  private programEntries: Map<string, Set<number>> = new Map();
  private stdlibIds = new Set<number>();
  private contractConstants = new Set<number>();
  private functions = new Map<
    number,
    AstFunctionDef | AstReceiver | AstContractInit
  >();
  private constants = new Map<number, AstConstantDef>();
  private contracts = new Map<number, AstContract>();
  private nativeFunctions = new Map<number, AstNativeFunctionDecl>();
  private asmFunctions = new Map<number, AstAsmFunctionDef>();
  private primitives = new Map<number, AstPrimitiveTypeDecl>();
  private structs = new Map<number, AstStructDecl>();
  private messages = new Map<number, AstMessageDecl>();
  private traits = new Map<number, AstTrait>();
  private statements = new Map<number, AstStatement>();

  private constructor(
    private ctx: MistiContext,
    private ast: AstStore,
  ) {
    this.processAstElements(this.ast.functions, this.processFunctionElement);
    this.processAstElements(this.ast.constants, this.processConstantElement);
    this.processAstElements(this.ast.types, this.processTypeElement);
  }
  public static make(ctx: MistiContext, ast: AstStore): TactASTStoreBuilder {
    return new TactASTStoreBuilder(ctx, ast);
  }

  private processAstElements<T extends { id: number; loc: SrcInfo }>(
    elements: T[],
    processor: (element: T) => void,
  ): void {
    elements.forEach((element) => {
      const filename = element.loc.file;
      if (filename === null) return;
      const elements = this.programEntries.get(filename);
      if (elements) {
        elements.add(element.id);
      } else {
        this.programEntries.set(filename, new Set([element.id]));
      }
      if (definedInStdlib(this.ctx, element.loc)) {
        this.stdlibIds.add(element.id);
      }
      processor.call(this, element);
    });
  }

  private processFunctionElement(
    func: AstFunctionDef | AstNativeFunctionDecl | AstAsmFunctionDef,
  ): void {
    switch (func.kind) {
      case "function_def":
        this.processFunction(func);
        break;
      case "asm_function_def":
        this.asmFunctions.set(func.id, func);
        break;
      case "native_function_decl":
        this.nativeFunctions.set(func.id, func);
        break;
      default:
        unreachable(func);
    }
  }

  private processConstantElement(constant: AstConstantDef): void {
    this.constants.set(constant.id, constant);
  }

  private processTypeElement(type: AstTypeDecl): void {
    this.processType(type);
  }

  public build(): TactASTStore {
    return new TactASTStore(
      this.stdlibIds,
      this.contractConstants,
      this.programEntries,
      this.functions,
      this.constants,
      this.contracts,
      this.nativeFunctions,
      this.asmFunctions,
      this.primitives,
      this.structs,
      this.messages,
      this.traits,
      this.statements,
    );
  }

  private processType(type: AstTypeDecl): void {
    switch (type.kind) {
      case "primitive_type_decl":
        this.primitives.set(type.id, type);
        break;
      case "struct_decl":
        this.structs.set(type.id, type);
        break;
      case "message_decl":
        this.messages.set(type.id, type);
        break;
      case "trait":
        this.processTrait(type);
        break;
      case "contract":
        this.processContract(type);
        break;
      default:
        unreachable(type);
    }
  }

  private processTrait(trait: AstTrait): void {
    this.traits.set(trait.id, trait);
    for (const decl of trait.declarations) {
      switch (decl.kind) {
        case "field_decl":
          // Do nothing, as they are accessible through trait definitions
          break;
        case "function_def":
        case "receiver":
          this.processFunction(decl);
          break;
        case "asm_function_def":
          this.asmFunctions.set(decl.id, decl);
          break;
        case "constant_def":
          this.constants.set(decl.id, decl);
          this.contractConstants.add(decl.id);
          break;
        case "constant_decl":
        case "function_decl":
          break;
        default:
          unreachable(decl);
      }
    }
  }

  private processContract(contract: AstContract): void {
    this.contracts.set(contract.id, contract);
    for (const decl of contract.declarations) {
      switch (decl.kind) {
        case "field_decl":
          // Do nothing, as they are accessible through contract definitions
          break;
        case "function_def":
        case "contract_init":
        case "receiver":
          this.processFunction(decl);
          break;
        case "asm_function_def":
          this.asmFunctions.set(decl.id, decl);
          break;
        case "constant_def":
          this.constants.set(decl.id, decl);
          this.contractConstants.add(decl.id);
          break;
        default:
          unreachable(decl);
      }
    }
  }

  private processFunction(
    func: AstFunctionDef | AstContractInit | AstReceiver,
  ): void {
    this.functions.set(func.id, func);
    func.statements?.forEach((stmt) => this.processStmt(stmt));
  }

  private processStmt(stmt: AstStatement): void {
    this.statements.set(stmt.id, stmt);
    switch (stmt.kind) {
      case "statement_let":
      case "statement_return":
      case "statement_expression":
      case "statement_assign":
      case "statement_augmentedassign":
        break;
      case "statement_condition":
        stmt.trueStatements.forEach((s) => this.processStmt(s));
        stmt.falseStatements?.forEach((s) => this.processStmt(s));
        if (stmt.elseif) {
          this.processStmt(stmt.elseif);
        }
        break;
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_foreach":
        stmt.statements.forEach((s) => this.processStmt(s));
        break;
      case "statement_try":
        stmt.statements.forEach((s) => this.processStmt(s));
        break;
      case "statement_try_catch":
        stmt.statements.forEach((s) => this.processStmt(s));
        stmt.catchStatements.forEach((s) => this.processStmt(s));
        break;
      default:
        unreachable(stmt);
    }
  }
}
