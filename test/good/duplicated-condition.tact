const A: Int = 5;
fun test(): Int {
    let a: Int = 1;

    // Bad: ternary operations
    a = (A > 5) ? ((A > 5) ? 1 : 2) : 3;
    a = (A > 5) ? 3 : ((A > 5) ? 1 : 2);

    // Bad: conditional statements
    if (A > 5) {
        a = 1;
    } else if (A > 5) {
        a = 2;
    } else {
        a = 3;
    }

    return a;
}

