import { SouffleFactValue } from "./syntax";

export function eqFactValues(
  lhs: SouffleFactValue[],
  rhs: SouffleFactValue[],
): boolean {
  return (
    lhs.length === rhs.length && lhs.every((value, idx) => value === rhs[idx])
  );
}
