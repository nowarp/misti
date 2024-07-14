fun test(): Int {
    let a: Int = 20;
    while (a > 10)  { // ok: a is changing within the loop
        a += 1;
    }
    return a;
}
