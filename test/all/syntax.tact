//
// Checks if the tools process various Tact syntax constructions.
//

trait T {
  abstract get fun getter(): Int;
  abstract const something: Int;
}
contract TestContract with T {
  override get fun getter(): Int { return 0 }
  override const something: Int = 42;
}
trait Z {
  a: Int;
  get fun getter(): Int {
      return self.a + 1;
  }
}
contract TestContractF {
    a: Int = 42;
    fun test() {}
}
trait TParent {
  a: Int;
  fun getA(): Int {
      return self.a;
  }
}
trait TChild with TParent {
  a: Int; // Declare 'a' to satisfy TParent's requirement
}
contract TestContractT with TChild {
    a: Int = 19;
    fun test(): Int { return self.getA(); }
    external() {}
}

fun test_try(a: Int) {
    try { a += 1; }
    try { /* empty */ }
    try { a = 19; } catch (err) { dump(err); }
}

fun test_loops() {
    let sum: Int = 0;
    let i: Int = 0;
    while (i < 10) {
      i = i + 1;
      sum = sum + i;
    }
    do {
      i = i - 1;
      sum = sum + i;
    } until (i > 10);
    repeat (10) {
      i = i + 1;
      sum = sum + i;
    }
    let m: map<Int, Int> = emptyMap();
    foreach (k, v in m) {}
}
