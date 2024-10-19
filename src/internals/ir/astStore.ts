import { InternalException } from "../exceptions";
import {
  AstAsmFunctionDef,
  AstConstantDef,
  AstModule,
  AstContract,
  SrcInfo,
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

export type AstItemParams = Partial<{
  includeStdlib: boolean;
  filename: string | undefined;
}>;

type Filename = string;

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
   * @param programEntries Identifiers of AST elements defined on the top-level of each file.
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
    private stdlibIds = new Set<AstNode["id"]>(),
    private contractConstants = new Set<AstNode["id"]>(),
    private programEntries: Map<Filename, Set<AstNode["id"]>>,
    private functions: Map<
      AstNode["id"],
      AstFunctionDef | AstReceiver | AstContractInit
    >,
    private constants: Map<AstNode["id"], AstConstantDef>,
    private contracts: Map<AstNode["id"], AstContract>,
    private nativeFunctions: Map<AstNode["id"], AstNativeFunctionDecl>,
    private asmFunctions: Map<AstNode["id"], AstAsmFunctionDef>,
    private primitives: Map<AstNode["id"], AstPrimitiveTypeDecl>,
    private structs: Map<AstNode["id"], AstStructDecl>,
    private messages: Map<AstNode["id"], AstMessageDecl>,
    private traits: Map<AstNode["id"], AstTrait>,
    private statements: Map<AstNode["id"], AstStatement>,
  ) {}

  /**
   * Returns top-level program entries in order as they defined in each file.
   */
  public getProgramEntries(includeStdlib: boolean = false): AstNode[] {
    return Array.from(this.programEntries.values()).flatMap((idSet) =>
      Array.from(idSet).reduce((acc, id) => {
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
      }, [] as AstNode[]),
    );
  }
  /**
   * Returns all the items defined within the program.
   * @param items The collection of items (functions or constants).
   * @param params Additional parameters:
   * - includeStdlib: If true, includes items defined in stdlib.
   * - filename: Filters out nodes defined in the given file.
   * @returns An iterator for the items.
   */
  public getItems<T extends { id: AstNode["id"]; loc: SrcInfo }>(
    items: Map<AstNode["id"], T>,
    { includeStdlib = false, filename }: AstItemParams = {},
  ): IterableIterator<T> {
    const filteredStdout = includeStdlib
      ? items.values()
      : Array.from(items.values())
          .filter((c) => !this.stdlibIds.has(c.id))
          .values();
    return filename === undefined
      ? filteredStdout
      : Array.from(filteredStdout)
          .filter((item: T) => this.fileMatches(item, filename))
          [Symbol.iterator]();
  }

  /**
   * Returns all the functions and methods defined within the program.
   */
  public getFunctions(
    params: AstItemParams = {},
  ): IterableIterator<AstFunctionDef | AstReceiver | AstContractInit> {
    return this.getItems(this.functions, params);
  }

  /**
   * Returns all the constants defined within the program, including top-level constants
   * and contract constants.
   * @param params Additional parameters:
   * - includeContract: If true, includes constants defined within a contract.
   */
  public getConstants(
    params: AstItemParams & { includeContract?: boolean } = {},
  ): IterableIterator<AstConstantDef> {
    const { includeContract = false, ...restParams } = params;
    const constants = this.getItems(this.constants, restParams);
    return includeContract
      ? constants
      : this.filterIterator(
          constants,
          (c) => !this.contractConstants.has(c.id),
        );
  }

  public getContracts(
    params: AstItemParams = {},
  ): IterableIterator<AstContract> {
    return this.getItems(this.contracts, params);
  }

  public getNativeFunctions(
    params: AstItemParams = {},
  ): IterableIterator<AstNativeFunctionDecl> {
    return this.getItems(this.nativeFunctions, params);
  }

  public getAsmFunctions(
    params: AstItemParams = {},
  ): IterableIterator<AstAsmFunctionDef> {
    return this.getItems(this.asmFunctions, params);
  }

  public getPrimitives(
    params: AstItemParams = {},
  ): IterableIterator<AstPrimitiveTypeDecl> {
    return this.getItems(this.primitives, params);
  }

  public getStructs(
    params: AstItemParams = {},
  ): IterableIterator<AstStructDecl> {
    return this.getItems(this.structs, params);
  }

  public getMessages(
    params: AstItemParams = {},
  ): IterableIterator<AstMessageDecl> {
    return this.getItems(this.messages, params);
  }

  public getTraits(params: AstItemParams = {}): IterableIterator<AstTrait> {
    return this.getItems(this.traits, params);
  }

  /**
   * Returns all the statements defined within the program.
   */
  public getStatements(): IterableIterator<AstStatement> {
    return this.statements.values();
  }

  /**
   * Retrieves a function or method by its ID.
   * @param id The unique identifier of the function or method.
   * @returns The function or method if found, otherwise undefined.
   */
  public getFunction(
    id: AstNode["id"],
  ): AstFunctionDef | AstReceiver | AstContractInit | undefined {
    return this.functions.get(id);
  }

  public hasFunction(id: AstNode["id"]): boolean {
    return this.getFunction(id) !== undefined;
  }

  /**
   * Retrieves a constant by its ID.
   * @param id The unique identifier of the constant.
   * @returns The constant if found, otherwise undefined.
   */
  public getConstant(id: AstNode["id"]): AstConstantDef | undefined {
    return this.constants.get(id);
  }

  public hasConstant(id: AstNode["id"]): boolean {
    return this.getConstant(id) !== undefined;
  }

  /**
   * Retrieves a contract by its ID.
   * @param id The unique identifier of the contract.
   * @returns The contract if found, otherwise undefined.
   */
  public getContract(id: AstNode["id"]): AstContract | undefined {
    return this.contracts.get(id);
  }

  public hasContract(id: AstNode["id"]): boolean {
    return this.getContract(id) !== undefined;
  }

  /**
   * Retrieves a native function by its ID.
   * @param id The unique identifier of the native function.
   * @returns The native function if found, otherwise undefined.
   */
  public getNativeFunction(
    id: AstNode["id"],
  ): AstNativeFunctionDecl | undefined {
    return this.nativeFunctions.get(id);
  }

  public hasNativeFunction(id: AstNode["id"]): boolean {
    return this.getNativeFunction(id) !== undefined;
  }

  /**
   * Retrieves an asm function by its ID.
   * @param id The unique identifier of the asm function.
   * @returns The asm function if found, otherwise undefined.
   */
  public getAsmFunction(id: AstNode["id"]): AstAsmFunctionDef | undefined {
    return this.asmFunctions.get(id);
  }

  public hasAsmFunction(id: AstNode["id"]): boolean {
    return this.getAsmFunction(id) !== undefined;
  }

  /**
   * Retrieves a primitive type by its ID.
   * @param id The unique identifier of the primitive type.
   * @returns The primitive type if found, otherwise undefined.
   */
  public getPrimitive(id: AstNode["id"]): AstPrimitiveTypeDecl | undefined {
    return this.primitives.get(id);
  }

  public hasPrimitive(id: AstNode["id"]): boolean {
    return this.getPrimitive(id) !== undefined;
  }

  /**
   * Retrieves a struct by its ID.
   * @param id The unique identifier of the struct.
   * @returns The struct if found, otherwise undefined.
   */
  public getStruct(id: AstNode["id"]): AstStructDecl | undefined {
    return this.structs.get(id);
  }

  public hasStruct(id: AstNode["id"]): boolean {
    return this.getStruct(id) !== undefined;
  }

  /**
   * Retrieves a message by its ID.
   * @param id The unique identifier of the message.
   * @returns The message if found, otherwise undefined.
   */
  public getMessage(id: AstNode["id"]): AstMessageDecl | undefined {
    return this.messages.get(id);
  }

  public hasMessage(id: AstNode["id"]): boolean {
    return this.getMessage(id) !== undefined;
  }

  /**
   * Retrieves a trait by its ID.
   * @param id The unique identifier of the trait.
   * @returns The trait if found, otherwise undefined.
   */
  public getTrait(id: AstNode["id"]): AstTrait | undefined {
    return this.traits.get(id);
  }

  public hasTrait(id: AstNode["id"]): boolean {
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
  public getStatement(id: AstNode["id"]): AstStatement | undefined {
    return this.statements.get(id);
  }

  public hasStatement(id: AstNode["id"]): boolean {
    return this.getStatement(id) !== undefined;
  }

  /**
   * Retrieves the IDs of methods for a specified contract which have one of the following types: AstFunctionDef, AstReceiver, AstContractInit.
   * @param contractId The ID of the contract.
   * @returns An array of method IDs or undefined if no contract is found.
   */
  public getMethods(contractId: AstNode["id"]): AstNode["id"][] | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    return contract.declarations.reduce(
      (result, decl) => {
        if (
          decl.kind === "function_def" ||
          decl.kind === "contract_init" ||
          decl.kind === "receiver"
        ) {
          result.push(decl.id);
        }
        return result;
      },
      [] as AstNode["id"][],
    );
  }

  /**
   * Retrieves the ID of the initialization function for a specified contract.
   * @param contractId The ID of the contract.
   * @returns The ID of the init function or undefined if the contract does not exist.
   */
  public getInitId(contractId: AstNode["id"]): AstNode["id"] | undefined {
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
  public getContractConstants(
    contractId: AstNode["id"],
  ): AstNode["id"][] | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    return contract.declarations.reduce(
      (result, decl) => {
        if (decl.kind === "constant_def") {
          result.push(decl.id);
        }
        return result;
      },
      [] as AstNode["id"][],
    );
  }

  /**
   * Retrieves fields defined within a specified contract.
   * @param contractId The ID of the contract.
   * @returns An array of AstFieldDecl or undefined if no contract is found.
   */
  public getContractFields(
    contractId: AstNode["id"],
  ): AstFieldDecl[] | undefined {
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

  /**
   * Retrieves fields defined in the traits the contract inherited.
   * @param contractId The ID of the contract.
   * @returns An array of AstFieldDecl or undefined if no contract or one its trait are found.
   */
  public getInheritedFields(
    contractId: AstNode["id"],
  ): AstFieldDecl[] | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    const fields = [] as AstFieldDecl[];
    contract.traits.forEach((traitId) => {
      const trait = this.findTrait(traitId.text);
      if (trait === undefined) {
        return undefined;
      }
      trait.declarations.forEach((decl) => {
        if (decl.kind === "field_decl") {
          fields.push(decl);
        }
      });
    });
    return fields;
  }

  /**
   * Retrieves items of specified kinds defined within a given file.
   * @param kinds An array of kinds to filter the items.
   * @param params Additional parameters:
   * - includeStdlib: If true, includes items defined in stdlib.
   * - filename: The filename to filter items by (required).
   * @returns An array of matching AstNode items.
   */
  public getItemsByKinds(
    kinds: AstNode["kind"][],
    params: AstItemParams & { filename: string },
  ): Exclude<AstNode, AstModule>[] {
    const result: Exclude<AstNode, AstModule>[] = [];
    // TODO: Should be rewritten: https://github.com/nowarp/misti/issues/186
    for (const kind of kinds) {
      switch (kind) {
        case "function_def":
        case "receiver":
        case "contract_init":
          result.push(...Array.from(this.getFunctions(params)));
          break;
        case "constant_def":
        case "constant_decl":
          result.push(
            ...Array.from(
              this.getConstants({ ...params, includeContract: true }),
            ),
          );
          break;
        case "contract":
          result.push(...Array.from(this.getContracts(params)));
          break;
        case "native_function_decl":
          result.push(...Array.from(this.getNativeFunctions(params)));
          break;
        case "asm_function_def":
          result.push(...Array.from(this.getAsmFunctions(params)));
          break;
        case "primitive_type_decl":
          result.push(...Array.from(this.getPrimitives(params)));
          break;
        case "struct_decl":
          result.push(...Array.from(this.getStructs(params)));
          break;
        case "message_decl":
          result.push(...Array.from(this.getMessages(params)));
          break;
        case "trait":
          result.push(...Array.from(this.getTraits(params)));
          break;
      }
    }
    return params.filename
      ? result.filter((item) => item.loc.file === params.filename)
      : result;
  }

  public fileMatches = (node: { loc: SrcInfo }, filename: string): boolean =>
    node.loc.file !== null && node.loc.file === filename;

  public *filterIterator<T>(
    iterator: IterableIterator<T>,
    condition: (item: T) => boolean,
  ): IterableIterator<T> {
    for (const item of iterator) {
      if (condition(item)) {
        yield item;
      }
    }
  }
}
