"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompilationUnit = exports.Contract = exports.CFG = exports.Node = exports.Edge = exports.IdxGenerator = void 0;
/**
 * Generates unique indexes is used to assign unique identifiers to nodes and edges,
 * ensuring that each element within the CFG can be distinctly referenced.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
var IdxGenerator;
(function (IdxGenerator) {
    let currentIdx = 0;
    function next() {
        currentIdx += 1;
        return currentIdx;
    }
    IdxGenerator.next = next;
    /**
     * Resets the current index number. For internal use only.
     */
    function __reset() {
        currentIdx = 0;
    }
    IdxGenerator.__reset = __reset;
})(IdxGenerator = exports.IdxGenerator || (exports.IdxGenerator = {}));
/**
 * Represents an edge in a Control Flow Graph (CFG), connecting two nodes.
 * Each edge signifies a potential flow of control from one statement to another.
 *
 * @param src The index of the source node from which the control flow originates.
 * @param dst The index of the destination node to which the control flow goes.
 */
class Edge {
    src;
    dst;
    idx;
    constructor(src, dst) {
        this.src = src;
        this.dst = dst;
        this.idx = IdxGenerator.next();
    }
}
exports.Edge = Edge;
/**
 * Represents a node in a Control Flow Graph (CFG), corresponding to a single statement in the source code.
 * Nodes are connected by edges that represent the flow of control between statements.
 *
 * @param stmtID The unique identifier of the statement this node represents.
 * @param srcEdges A set of indices for edges incoming to this node, representing control flows leading into this statement.
 * @param dstEdges A set of indices for edges outgoing from this node, representing potential control flows out of this statement.
 */
class Node {
    stmtID;
    srcEdges;
    dstEdges;
    idx;
    constructor(stmtID, srcEdges = new Set(), dstEdges = new Set()) {
        this.stmtID = stmtID;
        this.srcEdges = srcEdges;
        this.dstEdges = dstEdges;
        this.idx = IdxGenerator.next();
    }
}
exports.Node = Node;
/**
 * Describes the interprocedural control flow graph (CFG) that corresponds to a function or method within the project.
 */
class CFG {
    name;
    ty;
    nodes;
    edges;
    ref;
    /**
     * Creates an instance of CFG.
     * @param name The name of the function or method this CFG represents.
     * @param ty Indicates whether this CFG represents a standalone function or a method belonging to a contract or class.
     * @param nodes An array of nodes in the CFG.
     * @param edges An array of edges in the CFG.
     * @param ref AST reference that corresponds to the function definition.
     */
    constructor(name, ty, nodes, edges, ref) {
        this.name = name;
        this.ty = ty;
        this.nodes = nodes;
        this.edges = edges;
        this.ref = ref;
    }
}
exports.CFG = CFG;
/**
 * Represents an entry for a contract in the compilation unit which
 * encapsulates a collection of related methods and their configurations.
 */
class Contract {
    name;
    methods;
    ref;
    /**
     * Creates an instance of Contract.
     * @param name The unique name identifying this contract within the project.
     * @param methods A mapping of method names to their CFGs, representing the detailed flow and structure of each method included in the contract.
     * @param ref AST reference that corresponds to the contract definition.
     */
    constructor(name, methods, ref) {
        this.name = name;
        this.methods = methods;
        this.ref = ref;
    }
}
exports.Contract = Contract;
/**
 * Represents a Compilation Unit, encapsulating the information necessary for
 * analyzing a single Tact project.
 */
class CompilationUnit {
    projectName;
    ast;
    functions;
    contracts;
    /**
     * Creates an instance of CompilationUnit.
     * @param projectName The name of the project this Compilation Unit belongs to.
     * @param ast The AST of the project.
     * @param functions A mapping from names of free functions to their CFGs.
     * @param contracts A set of contract entries, representing the contracts and their methods.
     */
    constructor(projectName, ast, functions, contracts) {
        this.projectName = projectName;
        this.ast = ast;
        this.functions = functions;
        this.contracts = contracts;
    }
}
exports.CompilationUnit = CompilationUnit;
