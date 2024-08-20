contract Test {
    a: Int = 0;
    init(x: Int) {
        self.a = x; // Should be highlighted
    }
}
