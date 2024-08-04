fun test(): Int {
    let a: Int = 20; // read-only variable
    do  { // error: a is not changing within the loop
    } until (a > 10);
    return a;
}
