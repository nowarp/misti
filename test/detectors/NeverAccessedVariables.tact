fun test1(): Int {
    let a: Int = 20;
    if (true) { // Bad: write-only variable
        a = 42;
    }
    return 42;
}

fun test2() {
    while(true) { let a: Int = 0; }
}

fun test3(): Int {
    let a: Int = 20; // read-only variable
    let b: Int = 22; // read-only variable
    let c: Int = 24;
    if (true) { // no `neverAccessed` false positive: all are used
        c = a + b;
    }
    return c;
}

fun test4(): Int {
    let a: Int = 20; // never-accessed variable
    let b: Int = 22; // read-only variable
    return b;
}

contract FieldTest1 {
    f1: Address;
    f2: Int as uint256 = 0;
    foreachmap: map<Address, Address>;

    init() {
        self.f1 = sender();
    }

    get fun use_f1(): Address {
        return self.f1;
    }

    fun forEachUse() {
        // No warning: foreachmap is used
        let foreachmap: map<Address, Address> = self.foreachmap;
        foreach (_, _ in foreachmap) {}
    }
}

contract FieldTest2 {
    f1: Address;
    init() {
        self.f1 = sender();
    }
}

contract ConstantFieldTest {
    const val: Int = ton("0.01");
    fun test() {
        send(SendParameters{
            to: sender(),
            bounce: true,
            value: self.val,
            mode: SendRemainingValue + SendIgnoreErrors
        });
    }
}


contract TestContract {
    receive() {
        let test: Int = 123; // should be reported
    }
}

contract TestContract2 {
    receive() {
        let _test: Int = 123; // suppressed: no warning
    }
}