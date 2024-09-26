fun test() {
    // Suspicious: Report debug prints
    let a: Int = 42;
    dump(a);

    // OK: Primitive literals are not reported
    dump(42);
    dump("test is called");
    dump(false);
    dump(null);
}
