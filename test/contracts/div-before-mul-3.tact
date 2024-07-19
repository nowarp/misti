fun test(): Int {
  let a: Int = 10 / 3; // Division operation
  let b: Int = 3;
  let c: Int = 2;
  let taintedWitha1: Int = 2 - a;
  let taintedWitha2: Int = 55 + taintedWitha1;
  let result: Int = taintedWitha2 * c; // Error: Using a variable tainted with division
  return result;
}

