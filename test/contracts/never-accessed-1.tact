fun test(): Int {
    let a: Int = 20;
    if (true) { // error: write-only variable
        a = 42;
    }
    return a;
}
