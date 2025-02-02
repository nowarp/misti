fun test1() {
    let a: Int = 42;
    if (a == 42) {
        a = 43; // Bad
    } else {
        a = 43;
    }
}

fun test2(): Int {
    let a: Int = 42;
    return (a == 42) ? a + 43 : a + 43; // Bad
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
    return (a == 42) ? a + 44 : a + 43; // OK: No warning
}

fun test5() {
    let a: Int = 42;
    if (a == 42) {
    } else if (a == 43) {
        a = 43; // Bad
    } else if (a == 43) {
        a = 43;
    }
}

fun test6() {
    let a: Int = 42;
    if (a == 42) {
    } else if (a == 43) {
        a = 43; // Bad
    } else if (a == 44) {
        a = 43; // Bad
    } else if (a == 45) {
        a = 43;
    }
}
