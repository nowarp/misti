fun test1(): Int {
    let a: Int = 20; // never-accessed variable
    let b: Int = 22; // read-only variable
    return b;
}
