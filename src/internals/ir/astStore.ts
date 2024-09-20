import { InternalException } from "../exceptions";
import {
  AstAsmFunctionDef,
  AstConstantDef,
  AstContract,
  AstContractInit,
  AstFieldDecl,
  AstFunctionDef,
  AstMessageDecl,
  AstNativeFunctionDecl,
  AstNode,
  AstPrimitiveTypeDecl,
  AstReceiver,
  AstStatement,
  AstStructDecl,
  AstTrait,
} from "@tact-lang/compiler/dist/grammar/ast";

/**
 * Provides access to AST elements defined within a single Tact project.
 *
 * The generated AST entries includes all the dependent elements, including imported
 * code which is included in the project AST in C/C++ style.
 */
export class TactASTStore {
  /**
   * Constructs a TactASTStore with mappings to all major AST components accessible
   * by their unique AST identifiers.
   *
   * @param stdlibIds Identifiers of AST elements defined in stdlib.
   * @param contractConstants Identifiers of constants defined within contracts.
   * @param programEntries Identifiers of AST elements defined on the top-level.
   * @param functions Functions and methods including user-defined and special methods.
   * @param constants Constants defined across the compilation unit.
   * @param contracts Contracts defined within the project.
   * @param nativeFunctions Functions defined natively (not in user's source code).
   * @param asmFunctions Tact asm functions.
   * @param primitives Primitive types defined in the project.
   * @param structs Structs defined in the project.
   * @param messages Messages defined in the project.
   * @param traits Traits defined in the project.
   * @param statements All executable statements within all functions of the project.
   */
  constructor(
    private stdlibIds = new Set<number>(),
    private contractConstants = new Set<number>(),
    private programEntries: Set<number>,
    private functions: Map<
      number,
      AstFunctionDef | AstReceiver | AstContractInit
    >,
    private constants: Map<number, AstConstantDef>,
    private contracts: Map<number, AstContract>,
    private nativeFunctions: Map<number, AstNativeFunctionDecl>,
    private asmFunctions: Map<number, AstAsmFunctionDef>,
    private primitives: Map<number, AstPrimitiveTypeDecl>,
    private structs: Map<number, AstStructDecl>,
    private messages: Map<number, AstMessageDecl>,
    private traits: Map<number, AstTrait>,
    private statements: Map<number, AstStatement>,
  ) {}

  /**
   * Returns top-level program entries in order as they defined.
   */
  getProgramEntries(includeStdlib: boolean = false): AstNode[] {
    return Array.from(this.programEntries).reduce((acc, id) => {
      if (!includeStdlib && this.stdlibIds.has(id)) {
        return acc;
      }
      if (this.functions.has(id)) {
        acc.push(this.functions.get(id)!);
      } else if (this.constants.has(id)) {
        acc.push(this.constants.get(id)!);
      } else if (this.contracts.has(id)) {
        acc.push(this.contracts.get(id)!);
      } else if (this.nativeFunctions.has(id)) {
        acc.push(this.nativeFunctions.get(id)!);
      } else if (this.asmFunctions.has(id)) {
        acc.push(this.asmFunctions.get(id)!);
      } else if (this.primitives.has(id)) {
        acc.push(this.primitives.get(id)!);
      } else if (this.structs.has(id)) {
        acc.push(this.structs.get(id)!);
      } else if (this.messages.has(id)) {
        acc.push(this.messages.get(id)!);
      } else if (this.traits.has(id)) {
        acc.push(this.traits.get(id)!);
      } else {
        throw InternalException.make(`No entry found for ID: ${id}`);
      }
      return acc;
    }, [] as AstNode[]);
  }
  /**
   * Returns all the items defined within the program.
   * @param items The collection of items (functions or constants).
   * @param params Additional parameters:
   * - includeStdlib: If true, includes items defined in stdlib.
   * @returns An iterator for the items.
   */
  private getItems<T extends { id: number }>(
    items: Map<number, T>,
    { includeStdlib = false }: Partial<{ includeStdlib: boolean }> = {},
  ): IterableIterator<T> {
    if (includeStdlib) {
      return items.values();
    }
    const userItems = Array.from(items.values()).filter(
      (c) => !this.stdlibIds.has(c.id),
    );
    return userItems.values();
  }

  /**
   * Returns all the functions and methods defined within the program.
   * @param params Additional parameters:
   * - includeStdlib: If true, includes functions defined in stdlib.
   */
  getFunctions(
    params: Partial<{ includeStdlib: boolean }> = {},
  ): IterableIterator<AstFunctionDef | AstReceiver | AstContractInit> {
    return this.getItems(this.functions, params);
  }

  /**
   * Returns all the constants defined within the program, including top-level constants
   * and contract constants.
   * @param params Additional parameters:
   * - includeStdlib: If true, includes constants defined in stdlib.
   * - includeContract: If true, includes constants defined within a contract.
   */
  getConstants(
    params: Partial<{ includeStdlib: boolean; includeContract: boolean }> = {},
  ): IterableIterator<AstConstantDef> {
    const { includeContract = false } = params;
    const constants = this.getItems(this.constants, params);
    function* filterIterator(
      iterator: IterableIterator<AstConstantDef>,
      condition: (item: AstConstantDef) => boolean,
    ): IterableIterator<AstConstantDef> {
      for (const item of iterator) {
        if (condition(item)) {
          yield item;
        }
      }
    }
    return includeContract
      ? constants
      : filterIterator(constants, (c) => !this.contractConstants.has(c.id));
  }

  getContracts(): IterableIterator<AstContract> {
    return this.contracts.values();
  }

  getNativeFunctions(): IterableIterator<AstNativeFunctionDecl> {
    return this.nativeFunctions.values();
  }

  getAsmFunctions(): IterableIterator<AstAsmFunctionDef> {
    return this.asmFunctions.values();
  }

  getPrimitives(): IterableIterator<AstPrimitiveTypeDecl> {
    return this.primitives.values();
  }

  getStructs(): IterableIterator<AstStructDecl> {
    return this.structs.values();
  }

  getMessages(): IterableIterator<AstMessageDecl> {
    return this.messages.values();
  }

  getTraits(): IterableIterator<AstTrait> {
    return this.traits.values();
  }

  /**
   * Returns all the statements defined within the program.
   */
  getStatements(): IterableIterator<AstStatement> {
    return this.statements.values();
  }

  /**
   * Retrieves a function or method by its ID.
   * @param id The unique identifier of the function or method.
   * @returns The function or method if found, otherwise undefined.
   */
  public getFunction(
    id: number,
  ): AstFunctionDef | AstReceiver | AstContractInit | undefined {
    return this.functions.get(id);
  }

  public hasFunction(id: number): boolean {
    return this.getFunction(id) !== undefined;
  }

  /**
   * Retrieves a constant by its ID.
   * @param id The unique identifier of the constant.
   * @returns The constant if found, otherwise undefined.
   */
  public getConstant(id: number): AstConstantDef | undefined {
    return this.constants.get(id);
  }

  public hasConstant(id: number): boolean {
    return this.getConstant(id) !== undefined;
  }

  /**
   * Retrieves a contract by its ID.
   * @param id The unique identifier of the contract.
   * @returns The contract if found, otherwise undefined.
   */
  public getContract(id: number): AstContract | undefined {
    return this.contracts.get(id);
  }

  public hasContract(id: number): boolean {
    return this.getContract(id) !== undefined;
  }

  /**
   * Retrieves a native function by its ID.
   * @param id The unique identifier of the native function.
   * @returns The native function if found, otherwise undefined.
   */
  public getNativeFunction(id: number): AstNativeFunctionDecl | undefined {
    return this.nativeFunctions.get(id);
  }

  public hasNativeFunction(id: number): boolean {
    return this.getNativeFunction(id) !== undefined;
  }

  /**
   * Retrieves an asm function by its ID.
   * @param id The unique identifier of the asm function.
   * @returns The asm function if found, otherwise undefined.
   */
  public getAsmFunction(id: number): AstAsmFunctionDef | undefined {
    return this.asmFunctions.get(id);
  }

  public hasAsmFunction(id: number): boolean {
    return this.getAsmFunction(id) !== undefined;
  }

  /**
   * Retrieves a primitive type by its ID.
   * @param id The unique identifier of the primitive type.
   * @returns The primitive type if found, otherwise undefined.
   */
  public getPrimitive(id: number): AstPrimitiveTypeDecl | undefined {
    return this.primitives.get(id);
  }

  public hasPrimitive(id: number): boolean {
    return this.getPrimitive(id) !== undefined;
  }

  /**
   * Retrieves a struct by its ID.
   * @param id The unique identifier of the struct.
   * @returns The struct if found, otherwise undefined.
   */
  public getStruct(id: number): AstStructDecl | undefined {
    return this.structs.get(id);
  }

  public hasStruct(id: number): boolean {
    return this.getStruct(id) !== undefined;
  }

  /**
   * Retrieves a message by its ID.
   * @param id The unique identifier of the message.
   * @returns The message if found, otherwise undefined.
   */
  public getMessage(id: number): AstMessageDecl | undefined {
    return this.messages.get(id);
  }

  public hasMessage(id: number): boolean {
    return this.getMessage(id) !== undefined;
  }

  /**
   * Retrieves a trait by its ID.
   * @param id The unique identifier of the trait.
   * @returns The trait if found, otherwise undefined.
   */
  public getTrait(id: number): AstTrait | undefined {
    return this.traits.get(id);
  }

  public hasTrait(id: number): boolean {
    return this.getTrait(id) !== undefined;
  }

  public findTrait(name: string): AstTrait | undefined {
    return Array.from(this.traits.values()).find((t) => t.name.text === name);
  }

  /**
   * Retrieves a statement by its ID.
   * @param id The unique identifier of the statement.
   * @returns The statement if found, otherwise undefined.
   */
  public getStatement(id: number): AstStatement | undefined {
    return this.statements.get(id);
  }

  public hasStatement(id: number): boolean {
    return this.getStatement(id) !== undefined;
  }

  /**
   * Retrieves the IDs of methods for a specified contract which have one of the following types: AstFunctionDef, AstReceiver, AstContractInit.
   * @param contractId The ID of the contract.
   * @returns An array of method IDs or undefined if no contract is found.
   */
  public getMethods(contractId: number): number[] | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    return contract.declarations.reduce((result, decl) => {
      if (
        decl.kind === "function_def" ||
        decl.kind === "contract_init" ||
        decl.kind === "receiver"
      ) {
        result.push(decl.id);
      }
      return result;
    }, [] as number[]);
  }

  /**
   * Retrieves the ID of the initialization function for a specified contract.
   * @param contractId The ID of the contract.
   * @returns The ID of the init function or undefined if the contract does not exist.
   */
  public getInitId(contractId: number): number | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    const initFunction = contract.declarations.find(
      (decl) => decl.kind === "contract_init",
    );
    return initFunction ? initFunction.id : undefined;
  }

  /**
   * Retrieves the IDs of constants associated with a specified contract.
   * @param contractId The ID of the contract.
   * @returns An array of constant IDs or undefined if no contract is found.
   */
  public getContractConstants(contractId: number): number[] | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    return contract.declarations.reduce((result, decl) => {
      if (decl.kind === "constant_def") {
        result.push(decl.id);
      }
      return result;
    }, [] as number[]);
  }

  /**
   * Retrieves the fields defined within a specified contract.
   * @param contractId The ID of the contract.
   * @returns An array of AstFieldDecl or undefined if no contract is found.
   */
  public getContractFields(contractId: number): AstFieldDecl[] | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    return contract.declarations.reduce((result, decl) => {
      if (decl.kind === "field_decl") {
        result.push(decl);
      }
      return result;
    }, [] as AstFieldDecl[]);
  }
}
