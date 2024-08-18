fun test(): Int {
    let a: Int = 42;
    return (a == 42) ? a + 43 : a + 43; // bad
}
