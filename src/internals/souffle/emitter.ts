import { SouffleContext } from "./context";
import { SoufflePrettyPrinter } from "./prettyPrinter";
import path from "path";
import fs from "fs";

/**
 * Emits Souffle entries to a file.
 */
export class SouffleEmitter<FactData = undefined> {
  private constructor(
    private readonly ctx: SouffleContext<FactData>,
    private addComments: boolean,
  ) {}
  public static make<FactData = undefined>(
    ctx: SouffleContext<FactData>,
    { addComments = false }: Partial<{ addComments: boolean }> = {},
  ): SouffleEmitter<FactData> {
    return new SouffleEmitter<FactData>(ctx, addComments);
  }

  /**
   * Asynchronously emits the Soufflé program to a file within the specified directory.
   * @param dir The directory where the Soufflé fact files should be written.
   */
  public async dump(dir: string): Promise<void> {
    await fs.promises.writeFile(
      this.getPath(dir),
      this.getSourceCode(),
      "utf8",
    );
  }

  /**
   * Synchronously emits the Soufflé program to a file within the specified directory.
   * @param dir The directory where the Soufflé fact files should be written.
   */
  public dumpSync(dir: string): void | never {
    fs.writeFileSync(this.getPath(dir), this.getSourceCode(), "utf8");
  }

  private getPath(dir: string): string {
    return path.join(dir, this.ctx.filename);
  }

  private getSourceCode(): string {
    const program = this.ctx.generateProgram();
    const pp = SoufflePrettyPrinter.make<FactData>({
      addComments: this.addComments,
    });
    return pp.prettyPrint(program);
  }
}
