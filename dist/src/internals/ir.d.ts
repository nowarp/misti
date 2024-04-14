import { ASTConstant, ASTFunction, ASTNativeFunction, ASTType, ASTRef } from "@tact-lang/compiler/dist/grammar/ast";
export type ProjectName = string;
export type TactAST = {
    sources: {
        code: string;
        path: string;
    }[];
    funcSources: {
        code: string;
        path: string;
    }[];
    functions: (ASTFunction | ASTNativeFunction)[];
    constants: ASTConstant[];
    types: ASTType[];
};
export type EdgeIdx = number;
export type NodeIdx = number;
/**
 * Generates unique indexes is used to assign unique identifiers to nodes and edges,
 * ensuring that each element within the CFG can be distinctly referenced.
 */
export declare namespace IdxGenerator {
    function next(): number;
    /**
     * Resets the current index number. For internal use only.
     */
    function __reset(): void;
}
/**
 * Represents an edge in a Control Flow Graph (CFG), connecting two nodes.
 * Each edge signifies a potential flow of control from one statement to another.
 *
 * @param src The index of the source node from which the control flow originates.
 * @param dst The index of the destination node to which the control flow goes.
 */
export declare class Edge {
    src: NodeIdx;
    dst: NodeIdx;
    idx: EdgeIdx;
    constructor(src: NodeIdx, dst: NodeIdx);
}
/**
 * Represents a node in a Control Flow Graph (CFG), corresponding to a single statement in the source code.
 * Nodes are connected by edges that represent the flow of control between statements.
 *
 * @param stmtID The unique identifier of the statement this node represents.
 * @param srcEdges A set of indices for edges incoming to this node, representing control flows leading into this statement.
 * @param dstEdges A set of indices for edges outgoing from this node, representing potential control flows out of this statement.
 */
export declare class Node {
    stmtID: number;
    srcEdges: Set<EdgeIdx>;
    dstEdges: Set<EdgeIdx>;
    idx: NodeIdx;
    constructor(stmtID: number, srcEdges?: Set<EdgeIdx>, dstEdges?: Set<EdgeIdx>);
}
export type FunctionName = string;
export type ContractName = string;
/**
 * Describes the interprocedural control flow graph (CFG) that corresponds to a function or method within the project.
 */
export declare class CFG {
    name: FunctionName;
    ty: "function" | "method";
    nodes: Node[];
    edges: Edge[];
    ref: ASTRef;
    /**
     * Creates an instance of CFG.
     * @param name The name of the function or method this CFG represents.
     * @param ty Indicates whether this CFG represents a standalone function or a method belonging to a contract or class.
     * @param nodes An array of nodes in the CFG.
     * @param edges An array of edges in the CFG.
     * @param ref AST reference that corresponds to the function definition.
     */
    constructor(name: FunctionName, ty: "function" | "method", nodes: Node[], edges: Edge[], ref: ASTRef);
}
/**
 * Represents an entry for a contract in the compilation unit which
 * encapsulates a collection of related methods and their configurations.
 */
export declare class Contract {
    name: ContractName;
    methods: Map<FunctionName, CFG>;
    ref: ASTRef;
    /**
     * Creates an instance of Contract.
     * @param name The unique name identifying this contract within the project.
     * @param methods A mapping of method names to their CFGs, representing the detailed flow and structure of each method included in the contract.
     * @param ref AST reference that corresponds to the contract definition.
     */
    constructor(name: ContractName, methods: Map<FunctionName, CFG>, ref: ASTRef);
}
/**
 * Represents a Compilation Unit, encapsulating the information necessary for
 * analyzing a single Tact project.
 */
export declare class CompilationUnit {
    projectName: ProjectName;
    ast: TactAST;
    functions: Map<FunctionName, CFG>;
    contracts: Set<Contract>;
    /**
     * Creates an instance of CompilationUnit.
     * @param projectName The name of the project this Compilation Unit belongs to.
     * @param ast The AST of the project.
     * @param functions A mapping from names of free functions to their CFGs.
     * @param contracts A set of contract entries, representing the contracts and their methods.
     */
    constructor(projectName: ProjectName, ast: TactAST, functions: Map<FunctionName, CFG>, contracts: Set<Contract>);
}
