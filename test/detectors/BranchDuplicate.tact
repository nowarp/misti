fun test1() {
    let a: Int = 42;
    if (a == 42) {
        a = 43; // bad
    } else {
        a = 43;
    }
}

fun test2(): Int {
    let a: Int = 42;
    return (a == 42) ? a + 43 : a + 43; // bad
}

fun test3() {
    let a: Int = 42;
    if (a == 42) {
        a = 44; // OK: No warning
    } else {
        a = 43;
    }
}

fun test4(): Int {
    let a: Int = 42;
    return (a == 42) ? a + 44 : a + 43; //OK: No warning
}

