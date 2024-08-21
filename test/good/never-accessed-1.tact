fun test(): Int {
    let a: Int = 20;
    if (true) { // Bad: write-only variable
        a = 42;
    }
    return 42;
}
