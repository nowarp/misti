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

//
// Tact code covering all EffectFlags for testing CallGraph effects.
//
// Effects covered:
// - CALLS_SEND
// - CONTRACT_STATE_READ
// - CONTRACT_STATE_WRITE
// - ACCESSES_DATETIME
// - RANDOMNESS_USE
// - RANDOMNESS_SEED_INITIALIZATION
//

contract EffectTestContract {
    // State variable for read/write, initialized to 0
    someVariable: Int = 0;
    destAddress: Address;
    randomnessSeed: Int = 0;

    // Initialize destAddress in the constructor
    init() {
        self.destAddress = sender();
    }

    // Function that calls 'send' (CALLS_SEND)
    fun funcWithSend() {
        let amount: Int = 100;
        send(SendParameters{
            to: self.destAddress,
            value: amount
        });
    }

    // Function that reads from contract state (CONTRACT_STATE_READ)
    fun funcWithStateRead() {
        let value: Int = self.someVariable;
    }

    // Function that writes to contract state (CONTRACT_STATE_WRITE)
    fun funcWithStateWrite() {
        self.someVariable = 42;
    }

    // Function that accesses datetime (ACCESSES_DATETIME)
    fun funcWithDatetimeAccess() {
        let currentTime: Int = now();
    }

    // Function that uses randomness (RANDOMNESS_USE)
    fun funcWithRandomnessUse() {
        let randValue: Int = random(1, 100);
    }

    // Function that initializes randomness seed (RANDOMNESS_SEED_INITIALIZATION)
    fun funcWithRandomnessSeedInit(seed: Int) {
        self.randomnessSeed = seed;
    }

    fun generatePseudoRandom(): Int {
        self.randomnessSeed = (self.randomnessSeed * 1103515245 + 12345) % pow(2, 31);
        return self.randomnessSeed;
    }

    // Function that combines multiple effects
    fun funcWithMultipleEffects() {
        self.someVariable += random(1, 100);
        send(SendParameters{
            to: self.destAddress,
            value: self.someVariable
        });
        let time: Int = now();
        self.funcWithRandomnessSeedInit(time);
    }
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
