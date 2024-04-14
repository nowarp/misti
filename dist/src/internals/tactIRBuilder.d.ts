import { ASTStatement, ASTRef } from "@tact-lang/compiler/dist/grammar/ast";
import { MistiContext } from "./context";
import { Config as TactConfig } from "@tact-lang/compiler/dist/config/parseConfig";
import { ProjectName, CompilationUnit, TactAST, NodeIdx, Edge, Node, FunctionName, CFG } from "./ir";
/**
 * The TactIRBuilder class is responsible for constructing the Intermediate Representation (IR) of Tact projects.
 * Currently, it creates a one-statement-per-basic-block CFG.
 */
export declare class TactIRBuilder {
    private ctx;
    private tactConfigPath;
    /**
     * Creates an instance of TactIRBuilder.
     * @param ctx: Misti context.
     * @param tactConfigPath The path to the Tact configuration file.
     */
    constructor(ctx: MistiContext, tactConfigPath: string);
    /**
     * Generates the IR for each project defined in the Tact configuration.
     * @returns A mapping of project names to their corresponding CompilationUnit objects.
     */
    generate(): Map<ProjectName, CompilationUnit>;
    /**
     * Transforms an AST into a CompilationUnit object iterating over all function and contract definitions
     * to generate CFG for each function and method.
     * @param projectName The name of the project for which the compilation unit is being created.
     * @param ast The AST representing the parsed source code of the project.
     */
    CUFromAST(projectName: ProjectName, ast: TactAST): CompilationUnit;
    /**
     * Reads the Tact configuration file from the specified path, parses it, and returns
     * the TactConfig object.
     * @throws {Error} If the config file does not exist or cannot be parsed.
     * @returns The parsed TactConfig object.
     */
    readTactConfig(): TactConfig;
    /**
     * Parses the projects defined in the Tact configuration file, generating an AST for each.
     * @param config The Tact configuration object.
     * @returns A mapping of project names to their corresponding ASTs.
     */
    parseTactProjects(config: TactConfig): Map<ProjectName, TactAST>;
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
    createCFGFromStatements(functionName: FunctionName, functionTy: "function" | "method", statements: ASTStatement[] | null, ref: ASTRef): CFG;
    /**
     * Recursively processes an array of AST statements to generate nodes and edges for a CFG.
     *
     * @param statements The array of ASTStatement objects.
     * @param nodes An optional array of Node objects to which new nodes will be added.
     * @param edges An optional array of Edge objects to which new edges will be added.
     * @param parentNodeIdx An optional NodeIdx representing the index of the node from which control flow enters the current sequence of statements.
     * @returns A tuple containing the arrays of Node and Edge objects representing the CFG derived from the statements.
     */
    processStatements(statements: ASTStatement[], nodes?: Node[], edges?: Edge[], parentNodeIdx?: NodeIdx): [Node[], Edge[]];
}
/**
 * Creates the Intermediate Representation (IR) for projects defined in a Tact configuration file.
 */
export declare function createIR(ctx: MistiContext, tactConfig: string): Map<ProjectName, CompilationUnit>;
