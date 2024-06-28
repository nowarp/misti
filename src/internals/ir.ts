import {
  ASTRef,
  ASTStatement,
  ASTReceive,
  ASTField,
  ASTInitFunction,
  ASTNode,
  ASTFunction,
  ASTNativeFunction,
  ASTConstant,
  ASTContract,
  ASTPrimitive,
  ASTStruct,
  ASTTrait,
} from "@tact-lang/compiler/dist/grammar/ast";

export type ProjectName = string;

export type EntryOrigin = "user" | "stdlib";

/**
 * Provides storage and access to various AST components of a Tact project.
 */
export class TactASTStore {
  /**
   * Constructs a TactASTStore with mappings to all major AST components.
   * @param stdlibConstants Identifiers of constants defined in stdlib.
   * @param programEntries Identifiers of AST elements defined on the top-level.
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
    private stdlibConstants = new Set<number>(),
    private programEntries: Set<number>,
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
   * Returns program entries defined on the top-level.
   */
  getProgramEntries(): ASTNode[] {
    return Array.from(this.programEntries).reduce((acc, id) => {
      if (this.functions.has(id)) {
        acc.push(this.functions.get(id)!);
      } else if (this.constants.has(id)) {
        acc.push(this.constants.get(id)!);
      } else if (this.contracts.has(id)) {
        acc.push(this.contracts.get(id)!);
      } else if (this.nativeFunctions.has(id)) {
        acc.push(this.nativeFunctions.get(id)!);
      } else if (this.primitives.has(id)) {
        acc.push(this.primitives.get(id)!);
      } else if (this.structs.has(id)) {
        acc.push(this.structs.get(id)!);
      } else if (this.traits.has(id)) {
        acc.push(this.traits.get(id)!);
      } else {
        throw new Error(`No entry found for ID: ${id}`);
      }
      return acc;
    }, [] as ASTNode[]);
  }

  /**
   * Returns all the functions and methods defined within the program.
   */
  getFunctions(): IterableIterator<ASTFunction | ASTReceive | ASTInitFunction> {
    return this.functions.values();
  }

  /**
   * Returns all the constants defined within the program, including top-level constants
   * and contract constants.
   * @param includeStdlib If true, includes constants defined in stdlib.
   */
  getConstants(allowStdlib: boolean = true): IterableIterator<ASTConstant> {
    if (allowStdlib) {
      return this.constants.values();
    }
    const userConstants = Array.from(this.constants.values()).filter(
      (c) => !this.stdlibConstants.has(c.id),
    );
    return userConstants.values();
  }

  getContracts(): IterableIterator<ASTContract> {
    return this.contracts.values();
  }

  getNativeFunctions(): IterableIterator<ASTNativeFunction> {
    return this.nativeFunctions.values();
  }

  getPrimitives(): IterableIterator<ASTPrimitive> {
    return this.primitives.values();
  }

  getStructs(): IterableIterator<ASTStruct> {
    return this.structs.values();
  }

  getTraits(): IterableIterator<ASTTrait> {
    return this.traits.values();
  }

  /**
   * Returns all the statements defined within the program.
   */
  getStatements(): IterableIterator<ASTStatement> {
    return this.statements.values();
  }

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
  public getContractConstants(contractId: number): number[] | undefined {
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
  public getContractFields(contractId: number): ASTField[] | undefined {
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
export type CFGIdx = number;
export type ContractIdx = number;

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
 * Represents the kinds of basic blocks that can be present in a control flow graph (CFG).
 */
export type NodeKind =
  /**
   * Represents a regular control flow node with no special control behavior.
   */
  | { kind: "regular" }
  /**
   * Represents a node that contains function calls in its expressions.
   * `callees` refers to unique indecies of the callee within the CFG.
   * Functions which definitions are not available in the current
   * compilation unit are omitted.
   */
  | { kind: "call"; callees: Set<CFGIdx> }
  /**
   * Represents a return node that effectively terminates the execution of the current control flow.
   */
  | { kind: "return" };

/**
 * Represents a node in a Control Flow Graph (CFG), corresponding to a single statement in the source code.
 * Nodes are connected by edges that represent the flow of control between statements.
 *
 * @param stmtID The unique identifier of the statement this node represents.
 * @param kind Kind of the basic block representing ways it behave.
 * @param srcEdges A set of indices for edges incoming to this node, representing control flows leading into this statement.
 * @param dstEdges A set of indices for edges outgoing from this node, representing potential control flows out of this statement.
 */
export class Node {
  public idx: NodeIdx;
  constructor(
    public stmtID: number,
    public kind: NodeKind,
    public srcEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
    public dstEdges: Set<EdgeIdx> = new Set<EdgeIdx>(),
  ) {
    this.idx = IdxGenerator.next();
  }
}

export type FunctionName = string;
export type ContractName = string;

/**
 * Kind of a function that appear in CFG.
 */
export type FunctionKind = "function" | "method" | "receive";

/**
 * Describes the intraprocedural control flow graph (CFG) that corresponds to a function or method within the project.
 */
export class CFG {
  /**
   * The unique identifier of this CFG among the compilation unit it belongs to.
   */
  public idx: CFGIdx;

  /**
   * Map from unique node indices to nodes indecies in the `this.nodes`.
   */
  private nodesMap: Map<NodeIdx, number>;

  /**
   * Map from unique node indices to nodes indecies in the `this.edges`.
   */
  private edgesMap: Map<NodeIdx, number>;

  /**
   * Creates an instance of CFG.
   * @param name The name of the function or method this CFG represents.
   * @param kind Indicates whether this CFG represents a standalone function or a method or a receive method belonging to a contract.
   * @param origin Indicates whether the function was defined in users code or in standard library.
   * @param nodes Map of node indices to nodes in the CFG.
   * @param edges Map of edge indices to edges in the CFG.
   * @param ref AST reference that corresponds to the function definition.
   * @param idx An optional unique index. If not set, a new one will be chosen automatically.
   */
  constructor(
    public name: FunctionName,
    public kind: FunctionKind,
    public origin: EntryOrigin,
    public nodes: Node[],
    public edges: Edge[],
    public ref: ASTRef,
    idx: CFGIdx | undefined = undefined,
  ) {
    this.idx = idx ? idx : IdxGenerator.next();
    this.nodesMap = new Map();
    this.initializeMapping(this.nodesMap, nodes);
    this.edgesMap = new Map();
    this.initializeMapping(this.edgesMap, edges);
  }

  private initializeMapping(
    mapping: Map<NodeIdx | EdgeIdx, number>,
    entries: Node[] | Edge[],
  ): void {
    entries.forEach((entry, arrayIdx) => {
      mapping.set(entry.idx, arrayIdx);
    });
  }

  /**
   * Retrieves a Node from the CFG based on its unique index.
   * @param idx The index of the node to retrieve.
   * @returns The Node if found, otherwise undefined.
   */
  public getNode(idx: NodeIdx): Node | undefined {
    const nodesIdx = this.nodesMap.get(idx);
    if (nodesIdx === undefined) {
      return undefined;
    }
    return this.nodes[nodesIdx];
  }

  /**
   * Retrieves an Edge from the CFG based on its unique index.
   * @param idx The index of the edge to retrieve.
   * @returns The Edge if found, otherwise undefined.
   */
  public getEdge(idx: EdgeIdx): Edge | undefined {
    const edgesIdx = this.edgesMap.get(idx);
    if (edgesIdx === undefined) {
      return undefined;
    }
    return this.edges[edgesIdx];
  }

  private traverseNodes(
    edgeIdxs: Set<EdgeIdx>,
    isSrc: boolean,
  ): Node[] | undefined {
    return Array.from(edgeIdxs).reduce(
      (acc, srcIdx: NodeIdx) => {
        if (acc === undefined) {
          return undefined;
        }
        const edge = this.getEdge(srcIdx);
        if (edge === undefined) {
          return undefined;
        }
        const targetNode = this.getNode(isSrc ? edge.src : edge.dst);
        if (targetNode === undefined) {
          return undefined;
        }
        acc.push(targetNode);
        return acc;
      },
      [] as Node[] | undefined,
    );
  }

  /**
   * Returns successors for the given node.
   * @returns A list of predecessor nodes or `undefined` if any of the node indexes cannot be found in this CFG.
   */
  public getSuccessors(nodeIdx: NodeIdx): Node[] | undefined {
    const node = this.getNode(nodeIdx);
    if (node === undefined) {
      return undefined;
    }
    return this.traverseNodes(node.dstEdges, false);
  }

  /**
   * Returns predecessors for the given node.
   * @returns A list of predecessor nodes or `undefined` if any of the node indexes cannot be found in this CFG.
   */
  public getPredecessors(nodeIdx: NodeIdx): Node[] | undefined {
    const node = this.getNode(nodeIdx);
    if (node === undefined) {
      return undefined;
    }
    return this.traverseNodes(node.srcEdges, true);
  }

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
        throw new Error(`Cannot find a statement: #${cfgNode.stmtID}`);
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
   * The unique identifier of this Contract among the compilation unit it belongs to.
   */
  public idx: ContractIdx;

  /**
   * Creates an instance of Contract.
   * @param name The unique name identifying this contract within the project.
   * @param methods A mapping of method ids to their CFGs.
   * @param ref AST reference that corresponds to the contract definition.
   * @param idx An optional unique index. If not set, a new one will be chosen automatically.
   */
  constructor(
    public name: ContractName,
    public methods: Map<CFGIdx, CFG>,
    public ref: ASTRef,
    idx: ContractIdx | undefined = undefined,
  ) {
    this.idx = idx ? idx : IdxGenerator.next();
  }
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
   * @param functions A mapping from unique IDs of free functions to their CFGs.
   * @param contracts A mapping from unique IDs of contract entries to contracts.
   */
  constructor(
    public projectName: ProjectName,
    public ast: TactASTStore,
    public functions: Map<CFGIdx, CFG>,
    public contracts: Map<ContractIdx, Contract>,
  ) {}

  /**
   * Looks for a CFG with a specific index.
   * @returns Found CFG or `undefined` if not found.
   */
  public findCFGByIdx(idx: NodeIdx): CFG | undefined {
    const funCfg = this.functions.get(idx);
    if (funCfg) return funCfg;
    return Array.from(this.contracts.values())
      .map((contract) => contract.methods.get(idx))
      .find((cfg) => cfg !== undefined);
  }

  /**
   * Looks for a CFG for a function node with a specific name.
   * @returns Found CFG or `undefined` if not found.
   */
  public findFunctionCFGByName(name: FunctionName): CFG | undefined {
    return Array.from(this.functions.values()).find((cfg) => cfg.name === name);
  }

  /**
   * Looks for a CFG for a method node with a specific name.
   * @returns Found CFG or `undefined` if not found.
   */
  public findMethodCFGByName(
    contractName: ContractName,
    methodName: FunctionName,
  ): CFG | undefined {
    const contract = Array.from(this.contracts.values()).find(
      (contract) => contract.name === contractName,
    );
    if (!contract) {
      return undefined;
    }
    const cfg = Array.from(contract.methods.values()).find(
      (cfg) => cfg.name === methodName,
    );
    return cfg;
  }

  /**
   * Iterates over all CFGs in a Compilation Unit, and applies a callback to each node in every CFG.
   * @param astStore The store containing the AST nodes.
   * @param callback The function to apply to each node within each CFG.
   */
  forEachCFG(
    astStore: TactASTStore,
    callback: (cfg: CFG, node: Node, stmt: ASTStatement) => void,
  ) {
    // Iterate over all functions' CFGs
    this.functions.forEach((cfg, _) => {
      cfg.forEachNode(astStore, (stmt, node) => {
        callback(cfg, node, stmt);
      });
    });

    // Iterate over all contracts and their methods' CFGs
    this.contracts.forEach((contract) => {
      contract.methods.forEach((cfg, _) => {
        cfg.forEachNode(astStore, (stmt, node) => {
          callback(cfg, node, stmt);
        });
      });
    });
  }
}
