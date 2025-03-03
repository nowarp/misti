import { AstStore, ContractName, FunctionName } from "..";
import { MistiContext } from "../../context";
import { InternalException } from "../../exceptions";
import { AstNodeId } from "../../tact";
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
  AstStore as TactAstStore,
  idText,
  SrcInfo,
} from "../../tact/imports";
import { definedInStdlib } from "../../tact/stdlib";
import { unreachable } from "../../util";

/**
 * Transforms AstStore to AstStore.
 */
export class AstStoreBuilder {
  private programEntries: Map<string, Set<AstNodeId>> = new Map();
  private stdlibIds = new Set<AstNodeId>();
  /** Items defined within contracts and traits */
  private contractEntries = new Map<AstContract["id"], Set<AstNodeId>>();
  private functionNames = new Map<AstNodeId, FunctionName>();
  private functions = new Map<
    AstNodeId,
    AstFunctionDef | AstReceiver | AstContractInit
  >();
  private constants = new Map<AstNodeId, AstConstantDef>();
  private contracts = new Map<AstNodeId, AstContract>();
  private nativeFunctions = new Map<AstNodeId, AstNativeFunctionDecl>();
  private asmFunctions = new Map<AstNodeId, AstAsmFunctionDef>();
  private primitives = new Map<AstNodeId, AstPrimitiveTypeDecl>();
  private structs = new Map<AstNodeId, AstStructDecl>();
  private messages = new Map<AstNodeId, AstMessageDecl>();
  private traits = new Map<AstNodeId, AstTrait>();
  private statements = new Map<AstNodeId, AstStatement>();

  private constructor(
    private ctx: MistiContext,
    private ast: TactAstStore,
  ) {
    this.processAstElements(this.ast.functions, this.processFunctionElement);
    this.processAstElements(this.ast.constants, this.processConstantElement);
    this.processAstElements(this.ast.types, this.processType);
  }
  public static make(ctx: MistiContext, ast: TactAstStore): AstStoreBuilder {
    return new AstStoreBuilder(ctx, ast);
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
        this.processFunction(func, undefined);
        break;
      case "asm_function_def":
        this.processAsmFunction(func, undefined);
        break;
      case "native_function_decl":
        this.processNativeFunction(func);
        break;
      default:
        unreachable(func);
    }
  }

  private processConstantElement(constant: AstConstantDef): void {
    this.constants.set(constant.id, constant);
  }

  public build(): AstStore {
    return new AstStore(
      this.stdlibIds,
      this.contractEntries,
      this.programEntries,
      this.functionNames,
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
    const traitName = idText(trait.name) as ContractName;
    for (const decl of trait.declarations) {
      this.addContractEntry(trait.id, decl.id);
      switch (decl.kind) {
        case "field_decl":
          // Do nothing, as they are accessible through trait definitions
          break;
        case "function_def":
        case "receiver":
          this.processFunction(decl, traitName);
          break;
        case "asm_function_def":
          this.processAsmFunction(decl, traitName);
          break;
        case "constant_def":
          this.constants.set(decl.id, decl);
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
    const contractName = idText(contract.name) as ContractName;
    for (const decl of contract.declarations) {
      this.addContractEntry(contract.id, decl.id);
      switch (decl.kind) {
        case "field_decl":
          // Do nothing, as they are accessible through contract definitions
          break;
        case "function_def":
        case "contract_init":
        case "receiver":
          this.processFunction(decl, contractName);
          break;
        case "asm_function_def":
          this.processAsmFunction(decl, contractName);
          break;
        case "constant_def":
          this.constants.set(decl.id, decl);
          break;
        default:
          unreachable(decl);
      }
    }
  }

  private processFunction(
    func: AstFunctionDef | AstContractInit | AstReceiver,
    contract: ContractName | undefined,
  ): void {
    const name = this.extractFunctionName(func, contract);
    this.functionNames.set(func.id, name);
    this.functions.set(func.id, func);
    func.statements?.forEach((stmt) => this.processStmt(stmt));
  }

  private processAsmFunction(
    func: AstAsmFunctionDef,
    contract: ContractName | undefined,
  ): void {
    const name = this.extractFunctionName(func, contract);
    this.functionNames.set(func.id, name);
    this.asmFunctions.set(func.id, func);
  }

  private processNativeFunction(func: AstNativeFunctionDecl): void {
    const name = this.extractFunctionName(func, undefined);
    this.functionNames.set(func.id, name);
    this.nativeFunctions.set(func.id, func);
  }

  private processStmt(stmt: AstStatement): void {
    this.statements.set(stmt.id, stmt);
    switch (stmt.kind) {
      case "statement_let":
      case "statement_destruct":
      case "statement_return":
      case "statement_expression":
      case "statement_assign":
      case "statement_augmentedassign":
        break;
      case "statement_condition":
        stmt.trueStatements.forEach((s) => this.processStmt(s));
        stmt.falseStatements?.forEach((s) => this.processStmt(s));
        break;
      case "statement_while":
      case "statement_until":
      case "statement_repeat":
      case "statement_foreach":
      case "statement_block":
        stmt.statements.forEach((s) => this.processStmt(s));
        break;
      case "statement_try":
        stmt.statements.forEach((s) => this.processStmt(s));
        if (stmt.catchBlock) {
          stmt.catchBlock.catchStatements.forEach((s) => this.processStmt(s));
        }
        break;
      default:
        unreachable(stmt);
    }
  }

  private addContractEntry(contractId: AstNodeId, nodeId: AstNodeId): void {
    this.contractEntries.set(
      contractId,
      (this.contractEntries.get(contractId) || new Set()).add(nodeId),
    );
  }

  /**
   * Extracts the function name based on its type and optional contract name.
   * @param func The function definition, receiver, or initializer.
   * @param contract The optional contract name.
   * @returns The function name, or `undefined` if it cannot be determined.
   */
  private extractFunctionName(
    func:
      | AstFunctionDef
      | AstReceiver
      | AstContractInit
      | AstAsmFunctionDef
      | AstNativeFunctionDecl,
    contract: ContractName | undefined,
  ): FunctionName | never {
    const withContract = (base: string): FunctionName =>
      `${contract}::${base}` as FunctionName;
    const requireContract = () => {
      if (!contract) throw InternalException.make("");
    };
    switch (func.kind) {
      case "function_def":
        return contract
          ? withContract(idText(func.name))
          : (idText(func.name) as FunctionName);
      case "asm_function_def":
        return contract
          ? withContract(`[asm]${idText(func.name)}`)
          : (`[asm]${idText(func.name)}` as FunctionName);
      case "native_function_decl":
        return contract
          ? withContract(`[native]${idText(func.name)}`)
          : (`[native]${idText(func.name)}` as FunctionName);
      case "contract_init":
        requireContract();
        return withContract(`contract_init_${func.id}`);
      case "receiver":
        requireContract();
        return withContract(`receiver_${func.id}`);
      default:
        unreachable(func);
    }
  }
}
