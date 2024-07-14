fun test(): Int {
  let a: Int = 10;
  let b: Int = 3;
  let c: Int = 2;
  let result: Int = a * c / b; // ok: Multiplication before division
  return result;
}
