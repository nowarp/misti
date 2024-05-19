export enum FactType {
  Symbol = "Symbol",
  Number = "Number",
  Unsigned = "Unsigned",
  Float = "Float",
}

export type FactValue = string | number;

/**
 * Encapsulates information about a single Soufflé fact.
 */
export class Fact<T extends FactValue, D> {
  public values: T[];
  public data?: D;

  private constructor(values: T[], data?: D) {
    this.values = values;
    this.data = data;
  }

  static from<T extends FactValue, D>(values: T[], data?: D): Fact<T, D> {
    return new Fact(values, data);
  }

  /**
   * @returns `true` iff the given values are equal to those the current fact has.
   */
  public eqValues(values: FactValue[]): boolean {
    return (
      this.values.length === values.length &&
      this.values.every((value, idx) => value === values[idx])
    );
  }
}
