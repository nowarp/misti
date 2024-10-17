fun test1(): Int {
    let a: Int = 10; // Warning: read-only variable
    return a;
}

fun test2() {
    let a: Int = 10; // warning: read-only variable
    repeat (a) { /* do nothing */ }
    repeat (a) { /* ... */ }
}

fun test3() {
    let a: Int = 42; // warning: read-only variable
    if (a == 42) {}
}

fun test4() {
    let a: Int = 10; // warning: read-only variable
    if (a == 42) { /* do nothing */ }
}

fun test5() {
    let _a: Int = 10; // suppressed, no warning
    if (_a == 42) { /* do nothing */ }
}


contract Test {
    m: map<Int, Int>;
    get fun test(a: Int): Bool {
        let result: Int? = self.m.get(a); // OK: Cannot create a constant yet
        if (result == 1) {
            return true;
        }
        return false;
    }
}
