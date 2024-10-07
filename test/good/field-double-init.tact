contract Test1 {
    a: Int = 0;
    init(x: Int) {
        self.a = x; // Should be highlighted
    }
}

contract Test2 {
    a: Int;
    b: Int = 42; // No false positive
    init(x: Int) {
        self.a = x; // No false positive
    }
    get fun getB(): Int { return self.b; }
}
