fun test(): Int {
  let a: Int = 10 / 3; // Division operation
  let c: Int = 2;
  let taintedWithA1: Int = 2 - a;
  let taintedWithA2: Int = 55 + taintedWithA1;
  let result: Int = taintedWithA2 * c; // Error: Using a variable tainted with division
  return result;
}

