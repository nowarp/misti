fun test(): Int {
    let a: Int = 20; // read-only variable
    let b: Int = 22; // read-only variable
    let c: Int = 24;
    if (true) { // no `neverAccessed` false positive: all are used
        c = a + b;
    }
    return c;
}
