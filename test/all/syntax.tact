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

fun testTryCatch(a: Int) {
    try {
        a += 1;
    } catch (err) {
        dump(err);
    }
}

fun testLoops() {
    let sum: Int = 0;
    let i: Int = 0;

    while (i < 10) {
        i = i + 1;
        sum = sum + i;
    }

    do {
        i = i - 1;
        sum = sum + i;
    } until (i <= 0);

    repeat (10) {
        i = i + 1;
        sum = sum + i;
    }

    let m: map<Int, Int> = emptyMap();
    m.set(1, 10);
    m.set(2, 20);
    m.set(3, 30);

    foreach (key, value in m) {
        sum = sum + value;
    }
}

// Test callgraph effects
contract EffectTest {
    addr: Address;
    // Effect.StateWrite
    init() { self.addr = sender(); }

    // Effect.Send + Effect.StateRead
    fun funcWithSend() {
        let amount: Int = 100;
        send(SendParameters{ to: self.addr, value: amount });
    }

    // Effect.StateRead
    fun funcWithStateRead() {
        let value = self.addr;
    }

    // Effect.StateWrite
    fun funcWithStateWrite1() {
        self.addr = newAddress(0, 0);
    }
    fun funcWithStateWrite2(s: Slice): Address {
        return s.loadAddress();
    }

    // Multiple effects:
    // Effect.AccessDatetime + Effect.PrgUse + Effect.SeedInit
    fun funcWithMultipleEffects() {
        let currentTime: Int = now();
        let randValue: Int = random(1, 100);
        if (1 > 42) {
            nativeRandomizeLt();
        }
    }

    // Doesn't add the state write effect
    receive() {
        let a = beginString();
        a.append("f");
    }
}

// Checks if we add asm functions to IR entries correctly
asm(-> 1 0) extends mutates fun loadRefEx(self: Slice): Cell { LDREF }
fun callAsm(s: Slice): Cell { return s.loadRefEx(); }
