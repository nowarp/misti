fun test(): Int {
  let a: Int = 10;
  repeat (a) {} // no warning, since the repeat is bounded by definition
  return a;
}
