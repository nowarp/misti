/**
 * Defines the base structure for Misti static analysis detectors, including AST,
 * dataflow, and Soufflé-based detectors.
 *
 * Supports dynamic loading of built-in detectors, warning generation, and configurable
 * behavior for multi-project setups.
 *
 * @packageDocumentation
 */
import { MistiContext } from "../internals/context";
import { InternalException } from "../internals/exceptions";
import { CompilationUnit } from "../internals/ir";
import { MistiTactWarning, Severity, makeDocURL } from "../internals/warnings";
import {
  SouffleAsyncExecutor,
  SouffleContext,
  SouffleFact,
  comment,
} from "@nowarp/souffle";
import { SrcInfo } from "@tact-lang/compiler/dist/grammar/ast";

export type WarningsBehavior = "union" | "intersect";

export type DetectorName = string;
export type DetectorKind = "ast" | "dataflow" | "souffle";

/**
 * Abstract base class for a detector module, providing an interface for defining various types of detectors.
 */
export abstract class Detector {
  constructor(readonly ctx: MistiContext) {}

  /**
   * Gets the short identifier of the detector, used in analyzer warnings.
   * @returns The unique identifier of the detector.
   */
  get id(): DetectorName {
    return this.constructor.name;
  }

  /**
   * Gets the kind of the detector.
   */
  abstract get kind(): DetectorKind;

  /**
   * Defines the behavior of warnings generated by this detector when working with
   * multiple projects within a single Tact configuration.
   *
   * Here are the available options:
   * 1. `"union"`
   * Leave this value if you don't care about warnings generated in other projects.
   * 2. `"intersect"`
   * If the warning is generated for some source location of the imported file,
   * it should be generated by each of the projects. Example: Constants from an
   * imported file should not be reported iff they are unused in all the projects,
   * so you need "intersect".
   */
  public get shareImportedWarnings(): WarningsBehavior {
    return "union";
  }

  /**
   * Checks whether this detector needs the Soufflé binary to be executed.
   */
  public get usesSouffle(): boolean {
    return this.kind === "souffle";
  }

  /**
   * Executes the detector's logic to check for issues within the provided compilation unit.
   * @param cu The compilation unit to be analyzed.
   * @returns List of warnings has highlighted by this detector.
   */
  abstract check(cu: CompilationUnit): Promise<MistiTactWarning[]>;

  /**
   * Returns `true` if the identifier with the given name should not be reported
   * by unused variables detectors.
   */
  protected skipUnused(name: string): boolean {
    return name.startsWith(this.ctx.config.unusedPrefix);
  }

  /**
   * A wrapper method that creates Misti warnings with additional context about
   * the detector generated it.
   */
  protected makeWarning(
    description: string,
    severity: Severity,
    loc: SrcInfo,
    data: Partial<{
      extraDescription: string;
      suggestion: string;
    }> = {},
  ): MistiTactWarning {
    return MistiTactWarning.make(
      this.ctx,
      this.id,
      description,
      severity,
      loc,
      {
        ...data,
        docURL: hasBuiltInDetector(this.id) ? makeDocURL(this.id) : undefined,
      },
    );
  }
}

/**
 * Abstract class for detectors that identify specific patterns in the AST.
 */
export abstract class ASTDetector extends Detector {
  get kind(): DetectorKind {
    return "ast";
  }
}

/**
 * Abstract class for dataflow detectors that leverage the Monotone framework and a worklist solver.
 */
export abstract class DataflowDetector extends Detector {
  get kind(): DetectorKind {
    return "dataflow";
  }
}

/**
 * Abstract class for Souffle-based detectors that implement Datalog-based analyses.
 */
export abstract class SouffleDetector extends Detector {
  get kind(): DetectorKind {
    return "souffle";
  }

  /**
   * Creates a Soufflé context with unique name.
   * @param docstring A comment introduced on the top of the generated program if `ctx.config.souffleVerbose` is set.
   *
   * It should be used to avoid name clashes in the Soufflé directory when working with multiple projects.
   */
  protected createSouffleContext(
    cu: CompilationUnit,
    docstring:
      | string
      | string[]
      | undefined = `Generated by ${this.id} detector`,
  ): SouffleContext<SrcInfo> {
    return new SouffleContext<SrcInfo>(`${this.id}_${cu.projectName}`, {
      addComments: this.ctx.config.souffleVerbose,
      comment: docstring ? comment(docstring, "/*") : undefined,
    });
  }

  /**
   * Executes Souffle program for this detector converting output facts to warnings.
   * @param ctx Souffle context with all the declarations, rules and facts added.
   * @param callback A function that creates warnings from output facts.
   */
  protected async executeSouffle(
    ctx: SouffleContext<SrcInfo>,
    callback: (fact: SouffleFact<SrcInfo>) => MistiTactWarning | undefined,
  ): Promise<MistiTactWarning[]> {
    const executor = new SouffleAsyncExecutor<SrcInfo>({
      inputDir: this.ctx.config.soufflePath,
      outputDir: this.ctx.config.soufflePath,
    });
    const result = await executor.execute(ctx);
    if (result.kind !== "structured") {
      const error =
        result.kind === "error"
          ? result.stderr
          : "Cannot unmarshal raw output:\n" + result.results;
      throw InternalException.make(
        `Error executing Soufflé for ${this.id}:\n${error}`,
      );
    }
    return Array.from(result.results.entries.values()).reduce<
      MistiTactWarning[]
    >((acc, facts) => {
      return acc.concat(
        facts.reduce<MistiTactWarning[]>((innerAcc, fact) => {
          const warning = callback(fact);
          if (warning) {
            innerAcc.push(warning);
          }
          return innerAcc;
        }, []),
      );
    }, []);
  }
}

// Define the structure of each detector entry in the BuiltInDetectors map.
interface DetectorEntry {
  loader: (ctx: MistiContext) => Promise<Detector>;
  enabledByDefault: boolean;
}

/**
 * A mapping of detector names to their respective loader functions and default enablement status.
 */
const BuiltInDetectors: Record<string, DetectorEntry> = {
  DivideBeforeMultiply: {
    loader: (ctx: MistiContext) =>
      import("./builtin/divideBeforeMultiply").then(
        (module) => new module.DivideBeforeMultiply(ctx),
      ),
    enabledByDefault: true,
  },
  ReadOnlyVariables: {
    loader: (ctx: MistiContext) =>
      import("./builtin/readOnlyVariables").then(
        (module) => new module.ReadOnlyVariables(ctx),
      ),
    enabledByDefault: true,
  },
  NeverAccessedVariables: {
    loader: (ctx: MistiContext) =>
      import("./builtin/neverAccessedVariables").then(
        (module) => new module.NeverAccessedVariables(ctx),
      ),
    enabledByDefault: true,
  },
  UnboundLoops: {
    loader: (ctx: MistiContext) =>
      import("./builtin/unboundLoops").then(
        (module) => new module.UnboundLoops(ctx),
      ),
    enabledByDefault: true,
  },
  ZeroAddress: {
    loader: (ctx: MistiContext) =>
      import("./builtin/zeroAddress").then(
        (module) => new module.ZeroAddress(ctx),
      ),
    enabledByDefault: true,
  },
  ConstantAddress: {
    loader: (ctx: MistiContext) =>
      import("./builtin/constantAddress").then(
        (module) => new module.ConstantAddress(ctx),
      ),
    enabledByDefault: false,
  },
  BranchDuplicate: {
    loader: (ctx: MistiContext) =>
      import("./builtin/branchDuplicate").then(
        (module) => new module.BranchDuplicate(ctx),
      ),
    enabledByDefault: true,
  },
  DumpIsUsed: {
    loader: (ctx: MistiContext) =>
      import("./builtin/dumpIsUsed").then(
        (module) => new module.DumpIsUsed(ctx),
      ),
    enabledByDefault: false,
  },
  FieldDoubleInit: {
    loader: (ctx: MistiContext) =>
      import("./builtin/fieldDoubleInit").then(
        (module) => new module.FieldDoubleInit(ctx),
      ),
    enabledByDefault: true,
  },
  PreferAugmentedAssign: {
    loader: (ctx: MistiContext) =>
      import("./builtin/preferAugmentedAssign").then(
        (module) => new module.PreferAugmentedAssign(ctx),
      ),
    enabledByDefault: true,
  },
  StringReceiversOverlap: {
    loader: (ctx: MistiContext) =>
      import("./builtin/stringReceiversOverlap").then(
        (module) => new module.StringReceiversOverlap(ctx),
      ),
    enabledByDefault: true,
  },
  AsmIsUsed: {
    loader: (ctx: MistiContext) =>
      import("./builtin/asmIsUsed").then(
        (module) => new module.AsmIsUsed(ctx),
      ),
    enabledByDefault: false,
  }
};

/**
 * Asynchronously retrieves a built-in detector by its name.
 * If the detector is found in the BuiltInDetectors registry, it is loaded and returned;
 * otherwise, a warning is logged and `undefined` is returned.
 *
 * @param ctx Misti context.
 * @param name The name of the detector to retrieve. This name must match a key in the BuiltInDetectors object.
 * @returns A Promise that resolves to a Detector instance or `undefined` if the detector cannot be found or fails to load.
 */
export async function findBuiltInDetector(
  ctx: MistiContext,
  name: string,
): Promise<Detector | undefined> {
  const detectorEntry = BuiltInDetectors[name];
  if (!detectorEntry) {
    ctx.logger.warn(`Built-in detector ${name} not found.`);
    return undefined;
  }
  try {
    return await detectorEntry.loader(ctx);
  } catch (error) {
    ctx.logger.error(`Error loading built-in detector ${name}: ${error}`);
    return undefined;
  }
}

/**
 * Returns a list of all the available built-in detectors.
 * @returns An array of strings representing the names of detectors.
 */
export function getAllDetectors(): string[] {
  return Object.keys(BuiltInDetectors);
}

/**
 * Returns a list of detector names that are enabled by default.
 * @returns An array of strings representing the names of enabled detectors.
 */
export function getEnabledDetectors(): string[] {
  return Object.keys(BuiltInDetectors).filter(
    (name) => BuiltInDetectors[name].enabledByDefault,
  );
}

/**
 * @returns True if there is a built-in detector with the given name.
 */
export function hasBuiltInDetector(name: string): boolean {
  return name in BuiltInDetectors;
}
