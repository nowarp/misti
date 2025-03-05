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

struct S {
    b: Builder;
}

// Test callgraph effects
contract EffectTest {
    addr: Address;
    b: Builder;
    s: S;

    // Effect.StateWrite
    init() {
        self.addr = sender();
        self.b = beginCell();
        self.s = S{ b: beginCell() };
    }

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
        self.b.storeAddress(self.addr);
        self.s.b.storeAddress(self.addr);
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

// Regression test for: https://github.com/nowarp/misti/issues/266
contract A {
    m: map<Int, Int> = null;
    get fun m(): map<Int, Int> {
        return self.m;
    }
    receive() {
        while (true) {
            self.m.set(1, 2);
        }
    }
}

// Regression test for: https://github.com/nowarp/misti/issues/309
extends fun toInt(self: String): Int {
    let string: Slice = self.asSlice();
    let acc: Int = 0;
    while (!string.empty()) {
        let char: Int = string.loadUint(8);
        acc = (acc * 10) + (char - 48);
    }
    return acc;
}

// Regression test for: https://github.com/nowarp/misti/issues/324
contract ContractParams(
  owner: Address,
  seqno: Int as uint32,
) {
    receive() { }
}
