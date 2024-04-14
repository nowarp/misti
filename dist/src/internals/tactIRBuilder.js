"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIR = exports.TactIRBuilder = void 0;
const context_1 = require("@tact-lang/compiler/dist/context");
const store_1 = require("@tact-lang/compiler/dist/grammar/store");
const createNodeFileSystem_1 = require("@tact-lang/compiler/dist/vfs/createNodeFileSystem");
const precompile_1 = require("@tact-lang/compiler/dist/pipeline/precompile");
const parseConfig_1 = require("@tact-lang/compiler/dist/config/parseConfig");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ir_1 = require("./ir");
/**
 * The TactIRBuilder class is responsible for constructing the Intermediate Representation (IR) of Tact projects.
 * Currently, it creates a one-statement-per-basic-block CFG.
 */
class TactIRBuilder {
    ctx;
    tactConfigPath;
    /**
     * Creates an instance of TactIRBuilder.
     * @param ctx: Misti context.
     * @param tactConfigPath The path to the Tact configuration file.
     */
    constructor(ctx, tactConfigPath) {
        this.ctx = ctx;
        this.tactConfigPath = tactConfigPath;
    }
    /**
     * Generates the IR for each project defined in the Tact configuration.
     * @returns A mapping of project names to their corresponding CompilationUnit objects.
     */
    generate() {
        const config = this.readTactConfig();
        const astEntries = this.parseTactProjects(config);
        const irEntries = Array.from(astEntries).reduce((acc, [projectName, ast]) => {
            acc.set(projectName, this.CUFromAST(projectName, ast));
            return acc;
        }, new Map());
        return irEntries;
    }
    /**
     * Transforms an AST into a CompilationUnit object iterating over all function and contract definitions
     * to generate CFG for each function and method.
     * @param projectName The name of the project for which the compilation unit is being created.
     * @param ast The AST representing the parsed source code of the project.
     */
    CUFromAST(projectName, ast) {
        const functionCFGs = ast.functions.reduce((acc, fun) => {
            if (fun.kind == "def_function") {
                const name = fun.name;
                acc.set(name, this.createCFGFromStatements(name, "function", fun.statements, fun.ref));
            }
            return acc;
        }, new Map());
        const contractEntries = ast.types.reduce((acc, entry) => {
            if (entry.kind == "def_contract") {
                const contractName = entry.name;
                const methodCFGs = entry.declarations.reduce((methodAcc, decl) => {
                    if (decl.kind == "def_function") {
                        const name = decl.name;
                        methodAcc.set(name, this.createCFGFromStatements(name, "method", decl.statements, decl.ref));
                    }
                    else if (decl.kind == "def_init_function") {
                        const name = "init";
                        methodAcc.set(name, this.createCFGFromStatements(name, "method", decl.statements, decl.ref));
                    }
                    return methodAcc;
                }, new Map());
                acc.add(new ir_1.Contract(contractName, methodCFGs, entry.ref));
            }
            return acc;
        }, new Set());
        return new ir_1.CompilationUnit(projectName, ast, functionCFGs, contractEntries);
    }
    /**
     * Reads the Tact configuration file from the specified path, parses it, and returns
     * the TactConfig object.
     * @throws {Error} If the config file does not exist or cannot be parsed.
     * @returns The parsed TactConfig object.
     */
    readTactConfig() {
        const resolvedPath = path_1.default.resolve(this.tactConfigPath);
        let config;
        if (!fs_1.default.existsSync(resolvedPath)) {
            throw new Error("Unable to find config file at " + resolvedPath);
        }
        try {
            config = (0, parseConfig_1.parseConfig)(fs_1.default.readFileSync(resolvedPath, "utf8"));
        }
        catch (err) {
            throw new Error("Unable to parse config file at " + resolvedPath + ":\n" + err);
        }
        return config;
    }
    /**
     * Parses the projects defined in the Tact configuration file, generating an AST for each.
     * @param config The Tact configuration object.
     * @returns A mapping of project names to their corresponding ASTs.
     */
    parseTactProjects(config) {
        const project = (0, createNodeFileSystem_1.createNodeFileSystem)(path_1.default.dirname(this.tactConfigPath), false);
        const stdlibPath = path_1.default.resolve(__dirname, "..", "..", "node_modules", "@tact-lang/compiler", "stdlib");
        const stdlib = (0, createNodeFileSystem_1.createNodeFileSystem)(stdlibPath, false);
        return config.projects.reduce((acc, projectConfig) => {
            this.ctx.logger.debug(`Checking project ${projectConfig.name} ...`);
            const ctx = (0, precompile_1.precompile)(new context_1.CompilerContext({ shared: {} }), project, stdlib, projectConfig.path);
            acc.set(projectConfig.name, (0, store_1.getRawAST)(ctx));
            return acc;
        }, new Map());
    }
    /**
     * Generates nodes and edges for the CFG based on the statements within a given function or method.
     * Each node represents a single statement, and edges represent control flow between statements.
     *
     * @param functionName The name of the function or method being processed.
     * @param functionTy Indicates whether the input represents a function or a method.
     * @param statements An array of ASTStatement from the AST of the function or method.
     * @param ref AST reference to the corresponding function or method.
     * @returns A CFG instance populated with nodes and edges for the provided statements.
     */
    createCFGFromStatements(functionName, functionTy, statements, ref) {
        const [nodes, edges] = statements === null ? [[], []] : this.processStatements(statements);
        return new ir_1.CFG(functionName, functionTy, nodes, edges, ref);
    }
    /**
     * Recursively processes an array of AST statements to generate nodes and edges for a CFG.
     *
     * @param statements The array of ASTStatement objects.
     * @param nodes An optional array of Node objects to which new nodes will be added.
     * @param edges An optional array of Edge objects to which new edges will be added.
     * @param parentNodeIdx An optional NodeIdx representing the index of the node from which control flow enters the current sequence of statements.
     * @returns A tuple containing the arrays of Node and Edge objects representing the CFG derived from the statements.
     */
    processStatements(statements, nodes = [], edges = [], parentNodeIdx) {
        let lastNodeIdx = parentNodeIdx;
        statements.forEach((statement, index) => {
            const newNode = new ir_1.Node(statement.id);
            nodes.push(newNode);
            // For the first node, if there's a parent node, connect this node to the parent
            if (index === 0 && parentNodeIdx !== undefined) {
                const edgeToParent = new ir_1.Edge(parentNodeIdx, newNode.idx);
                edges.push(edgeToParent);
                nodes
                    .find((node) => node.idx === parentNodeIdx)
                    ?.dstEdges.add(edgeToParent.idx);
                newNode.srcEdges.add(edgeToParent.idx);
            }
            else if (lastNodeIdx !== undefined) {
                // Connect this node to the last node if it's not the first or has a specific parent node
                const newEdge = new ir_1.Edge(lastNodeIdx, newNode.idx);
                edges.push(newEdge);
                nodes
                    .find((node) => node.idx === lastNodeIdx)
                    ?.dstEdges.add(newEdge.idx);
                newNode.srcEdges.add(newEdge.idx);
            }
            // Update the lastNodeIdx to the current node's index
            lastNodeIdx = newNode.idx;
            if (statement.kind == "statement_let" ||
                statement.kind == "statement_expression" ||
                statement.kind == "statement_assign" ||
                statement.kind == "statement_augmentedassign") {
                // Logic for linear flow statements
            }
            else if (statement.kind === "statement_condition") {
                // Branching logic for trueStatements
                const [trueNodes, trueEdges] = this.processStatements(statement.trueStatements, nodes, edges, newNode.idx);
                nodes = trueNodes;
                edges = trueEdges;
                // Connect to the next node in the main flow if it exists
                const nextNodeIdx = statements[index + 1]?.id;
                if (nextNodeIdx) {
                    const edgeToNext = new ir_1.Edge(newNode.idx, nextNodeIdx);
                    edges.push(edgeToNext);
                    newNode.dstEdges.add(edgeToNext.idx);
                }
                if (statement.falseStatements) {
                    // Branching logic for falseStatements
                    const [falseNodes, falseEdges] = this.processStatements(statement.falseStatements, nodes, edges, newNode.idx);
                    nodes = falseNodes;
                    edges = falseEdges;
                    // Connect false branch to the next node in the main flow if it exists
                    if (nextNodeIdx) {
                        const edgeToNextFromFalse = new ir_1.Edge(newNode.idx, nextNodeIdx);
                        edges.push(edgeToNextFromFalse);
                        newNode.dstEdges.add(edgeToNextFromFalse.idx);
                    }
                }
            }
            else if (statement.kind == "statement_while" ||
                statement.kind == "statement_until" ||
                statement.kind == "statement_repeat") {
                // Create an edge from the current node (loop condition) back to the start of the loop body,
                // and from the end of the loop body back to the current node to represent the loop's cycle.
                // Also, ensure the loop connects to the next node after the loop concludes.
                // Process the statements within the loop body.
                const [loopNodes, loopEdges] = this.processStatements(statement.statements, [], [], newNode.idx);
                // Concatenate the loop nodes and edges with the main lists.
                nodes = nodes.concat(loopNodes);
                edges = edges.concat(loopEdges);
                // Create an edge from the last node in the loop back to the condition to represent the loop's cycle.
                if (loopNodes.length > 0) {
                    const backEdge = new ir_1.Edge(loopNodes[loopNodes.length - 1].idx, newNode.idx);
                    edges.push(backEdge);
                    loopNodes[loopNodes.length - 1].dstEdges.add(backEdge.idx);
                    newNode.srcEdges.add(backEdge.idx);
                }
                // Connect to the next node in the main flow, representing the exit from the loop.
                // This requires identifying the next statement after processing the loop.
                const nextNodeIdx = statements[index + 1]?.id;
                if (nextNodeIdx !== undefined) {
                    // Delay the creation of the edge to next node until after loop processing.
                    const exitEdge = new ir_1.Edge(newNode.idx, nextNodeIdx);
                    edges.push(exitEdge);
                    newNode.dstEdges.add(exitEdge.idx);
                }
                // Prevent automatic linking to the next node, since we have already done this manually.
                lastNodeIdx = undefined;
            }
            else if (statement.kind === "statement_return") {
                // No need to connect return statements to subsequent nodes
                lastNodeIdx = undefined; // This effectively ends the current flow
            }
            else {
                throw new Error(`Unsupported statement: ${statement}`);
            }
        });
        return [nodes, edges];
    }
}
exports.TactIRBuilder = TactIRBuilder;
/**
 * Creates the Intermediate Representation (IR) for projects defined in a Tact configuration file.
 */
function createIR(ctx, tactConfig) {
    return new TactIRBuilder(ctx, tactConfig).generate();
}
exports.createIR = createIR;
