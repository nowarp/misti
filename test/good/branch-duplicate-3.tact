fun test() {
    let a: Int = 42;
    if (a == 42) {
        a = 44; // no false positive
    } else {
        a = 43;
    }
}

