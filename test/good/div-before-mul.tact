fun test1(): Int {
  let a: Int = 10;
  let b: Int = 3;
  let c: Int = 2;
  let result: Int = a / b * c; // Error: Division before multiplication
  return result;
}

fun test2(): Int {
  let a: Int = 10;
  let b: Int = 3;
  let c: Int = 2;
  let result: Int = a * c / b; // OK: Multiplication before division
  return result;
}

fun test3(): Int {
  let a: Int = 10 / 3; // Division operation
  let c: Int = 2;
  let taintedWithA1: Int = 2 - a;
  let taintedWithA2: Int = 55 + taintedWithA1;
  let result: Int = taintedWithA2 * c; // Error: Using a variable tainted with division
  return result;
}

