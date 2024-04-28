import {
  ASTRef,
  ASTStatement,
  ASTReceive,
  ASTField,
  ASTInitFunction,
  ASTFunction,
  ASTNativeFunction,
  ASTConstant,
  ASTContract,
  ASTPrimitive,
  ASTStruct,
  ASTTrait,
} from "@tact-lang/compiler/dist/grammar/ast";

export type ProjectName = string;

/**
 * Provides storage and access to various AST components of a Tact project.
 */
export class TactASTStore {
  /**
   * Constructs a TactASTStore with mappings to all major AST components.
   * @param functions Functions and methods including user-defined and special methods.
   * @param constants Constants defined across the compilation unit.
   * @param contracts Contracts defined within the project.
   * @param nativeFunctions Functions defined natively (not in user's source code).
   * @param primitives Primitive types defined in the project.
   * @param structs Structs defined in the project.
   * @param traits Traits defined in the project.
   * @param statements All executable statements within all functions of the project.
   */
  constructor(
    private functions: Map<number, ASTFunction | ASTReceive | ASTInitFunction>,
    private constants: Map<number, ASTConstant>,
    private contracts: Map<number, ASTContract>,
    private nativeFunctions: Map<number, ASTNativeFunction>,
    private primitives: Map<number, ASTPrimitive>,
    private structs: Map<number, ASTStruct>,
    private traits: Map<number, ASTTrait>,
    private statements: Map<number, ASTStatement>,
  ) {}

  /**
   * Retrieves a function or method by its ID.
   * @param id The unique identifier of the function or method.
   * @returns The function or method if found, otherwise undefined.
   */
  public getFunction(
    id: number,
  ): ASTFunction | ASTReceive | ASTInitFunction | undefined {
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
  public getConstant(id: number): ASTConstant | undefined {
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
  public getContract(id: number): ASTContract | undefined {
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
  public getNativeFunction(id: number): ASTNativeFunction | undefined {
    return this.nativeFunctions.get(id);
  }

  public hasNativeFunction(id: number): boolean {
    return this.getNativeFunction(id) !== undefined;
  }

  /**
   * Retrieves a primitive type by its ID.
   * @param id The unique identifier of the primitive type.
   * @returns The primitive type if found, otherwise undefined.
   */
  public getPrimitive(id: number): ASTPrimitive | undefined {
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
  public getStruct(id: number): ASTStruct | undefined {
    return this.structs.get(id);
  }

  public hasStruct(id: number): boolean {
    return this.getStruct(id) !== undefined;
  }

  /**
   * Retrieves a trait by its ID.
   * @param id The unique identifier of the trait.
   * @returns The trait if found, otherwise undefined.
   */
  public getTrait(id: number): ASTTrait | undefined {
    return this.traits.get(id);
  }

  public hasTrait(id: number): boolean {
    return this.getTrait(id) !== undefined;
  }

  /**
   * Retrieves a statement by its ID.
   * @param id The unique identifier of the statement.
   * @returns The statement if found, otherwise undefined.
   */
  public getStatement(id: number): ASTStatement | undefined {
    return this.statements.get(id);
  }

  public hasStatement(id: number): boolean {
    return this.getStatement(id) !== undefined;
  }

  /**
   * Retrieves the IDs of methods for a specified contract which have one of the following types: ASTFunction, ASTReceive, ASTInitFunction.
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
        decl.kind === "def_function" ||
        decl.kind === "def_init_function" ||
        decl.kind === "def_receive"
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
      (decl) => decl.kind === "def_init_function",
    );
    return initFunction ? initFunction.id : undefined;
  }

  /**
   * Retrieves the IDs of constants associated with a specified contract.
   * @param contractId The ID of the contract.
   * @returns An array of constant IDs or undefined if no contract is found.
   */
  public getConstants(contractId: number): number[] | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    return contract.declarations.reduce((result, decl) => {
      if (decl.kind === "def_constant") {
        result.push(decl.id);
      }
      return result;
    }, [] as number[]);
  }

  /**
   * Retrieves the fields defined within a specified contract.
   * @param contractId The ID of the contract.
   * @returns An array of ASTField or undefined if no contract is found.
   */
  public getFields(contractId: number): ASTField[] | undefined {
    const contract = this.getContract(contractId);
    if (!contract) {
      return undefined;
    }
    return contract.declarations.reduce((result, decl) => {
      if (decl.kind === "def_field") {
        result.push(decl);
      }
      return result;
    }, [] as ASTField[]);
  }
}

export type EdgeIdx = number;
export type NodeIdx = number;

/**
 * Generates unique indexes is used to assign unique identifiers to nodes and edges,
 * ensuring that each element within the CFG can be distinctly referenced.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IdxGenerator {
  let currentIdx = 0;
  export function next(): number {
    currentIdx += 1;
    return currentIdx;
  }

  /**
   * Resets the current index number. For internal use only.
   */
  export function __reset() {
    currentIdx = 0;
  }
}

/**
 * Represents an edge in a Control Flow Graph (CFG), connecting two nodes.
 * Each edge signifies a potential flow of control from one statement to another.
 *
 * @param src The index of the source node from which the control flow originates.
 * @param dst The index of the destination node to which the control flow goes.
 */
export class Edge {
  public idx: EdgeIdx;
  constructor(
    public src: NodeIdx,
    public dst: NodeIdx,
  ) {
    this.idx = IdxGenerator.next();
  }
}

/**
 * Represents a node in a Control Flow Graph (CFG), corresponding to a single statement in the source code.
 * Nodes are connected by edges that represent the flow of control between statements.
 *
 * @param stmtID The unique identifier of the statement this node represents.
 * @param srcEdges A set of indices for edges incoming to this node, representing control flows leading into this statement.
 * @param dstEdges A set of indices for edges outgoing from this node, representing potential control flows out of this statement.
 */
export class Node {
  public idx: NodeIdx;
  constructor(
    public stmtID: number,
    public srcEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
    public dstEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
  ) {
    this.idx = IdxGenerator.next();
  }
}

export type FunctionName = string;
export type ContractName = string;

/**
 * Describes the intraprocedural control flow graph (CFG) that corresponds to a function or method within the project.
 */
export class CFG {
  /**
   * Creates an instance of CFG.
   * @param name The name of the function or method this CFG represents.
   * @param ty Indicates whether this CFG represents a standalone function or a method belonging to a contract or class.
   * @param nodes An array of nodes in the CFG.
   * @param edges An array of edges in the CFG.
   * @param ref AST reference that corresponds to the function definition.
   */
  constructor(
    public name: FunctionName,
    public ty: "function" | "method",
    public nodes: Node[],
    public edges: Edge[],
    public ref: ASTRef,
  ) {}

  /**
   * Iterates over all nodes in a CFG, applying a callback to each node.
   * The callback can perform any operation, such as analyzing or transforming the node.
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each node.
   */
  forEachNode(
    astStore: TactASTStore,
    callback: (stmt: ASTStatement, cfgNode: Node) => void,
  ) {
    this.nodes.forEach((cfgNode) => {
      const astNode = astStore.getStatement(cfgNode.stmtID);
      if (astNode) {
        callback(astNode, cfgNode);
      } else {
        throw new Error(`Cannot find a statement: id=${cfgNode.stmtID}`);
      }
    });
  }
}

/**
 * Represents an entry for a contract in the compilation unit which
 * encapsulates a collection of related methods and their configurations.
 */
export class Contract {
  /**
   * Creates an instance of Contract.
   * @param name The unique name identifying this contract within the project.
   * @param methods A mapping of method names to their CFGs, representing the detailed flow and structure of each method included in the contract.
   * @param ref AST reference that corresponds to the contract definition.
   */
  constructor(
    public name: ContractName,
    public methods: Map<FunctionName, CFG>,
    public ref: ASTRef,
  ) {}
}

/**
 * Represents a Compilation Unit, encapsulating the information necessary for
 * analyzing a single Tact project.
 */
export class CompilationUnit {
  /**
   * Creates an instance of CompilationUnit.
   * @param projectName The name of the project this Compilation Unit belongs to.
   * @param ast The AST of the project.
   * @param functions A mapping from names of free functions to their CFGs.
   * @param contracts A set of contract entries, representing the contracts and their methods.
   */
  constructor(
    public projectName: ProjectName,
    public ast: TactASTStore,
    public functions: Map<FunctionName, CFG>,
    public contracts: Set<Contract>,
  ) {}

  /**
   * Iterates over all CFGs in a Compilation Unit, and applies a callback to each node in every CFG.
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each node within each CFG.
   */
  forEachCFG(
    astStore: TactASTStore,
    callback: (funName: string, stmt: ASTStatement, cfgNode: Node) => void,
  ) {
    // Iterate over all functions' CFGs
    this.functions.forEach((cfg, functionName) => {
      cfg.forEachNode(astStore, (astNode, cfgNode) => {
        callback(functionName, astNode, cfgNode);
      });
    });

    // Iterate over all contracts and their methods' CFGs
    this.contracts.forEach((contract) => {
      contract.methods.forEach((cfg, methodName) => {
        cfg.forEachNode(astStore, (astNode, cfgNode) => {
          callback(`${contract.name}.${methodName}`, astNode, cfgNode);
        });
      });
    });
  }
}
