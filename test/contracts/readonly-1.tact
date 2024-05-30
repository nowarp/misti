fun test(): Int {
    let a: Int = 20;
    let b: Int = 22;
    let c: Int = 24;
    if (true) { // no false positive: all are used
        c = a + b;
    }
    return c;
}
