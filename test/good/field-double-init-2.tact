contract Test {
    a: Int;
    b: Int = 42; // No false positive
    init(x: Int) {
        self.a = x; // No false positive
    }
    get fun getB(): Int { return self.b; }
}
