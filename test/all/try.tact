fun test1(): Int {
    let a: Int = 42;
    try {
        a += 1;
    }
    return 42;
}

fun test2(): Int {
    try { /* empty */ }
    return 42;
}

fun test3(): Int {
    let a: Int = 0;
    try {
        a = 19;
    } catch (err) {
        dump(err);
    }
    return a;
}