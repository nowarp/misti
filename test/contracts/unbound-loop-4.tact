fun fn(a: Int) {
}

fun test(): Int {
    let a: Int = 20;
    while (a > 10)  { // ok: a is using within the loop
        fn(a);
    }
    return a;
}
