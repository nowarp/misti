fun test(): Int {
    let a: Int = 20; // read-only variable
    while (a > 10) { // error: a is not changing within the loop
    }
    return a;
}
