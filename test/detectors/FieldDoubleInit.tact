contract Test1 {
    a1: Int = 0;
    a2: Int = 0;
    init(x: Int) {
        self.a1 = x; // Should be highlighted
        // @misti:suppress FieldDoubleInit
        self.a2 = x; // OK: Suppressed
    }
}

contract Test2 {
    a: Int;
    b: Int = 42; // OK: No false positive
    init(x: Int) {
        self.a = x; // OK: No false positive
    }
    get fun getB(): Int { return self.b; }
}
