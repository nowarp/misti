fun test(): Int {
    let a: Int = 42;
    return (a == 42) ? a + 44 : a + 43; // no false positive
}

