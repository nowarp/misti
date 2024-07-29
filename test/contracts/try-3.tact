fun test(): Int {
    let a: Int = 0;
    try {
        a = 19;
    } catch (err) {
        dump(err);
    }
    return a;
}

