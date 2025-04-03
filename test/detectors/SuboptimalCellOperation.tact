contract Test {
    fun loadBit() {}

    fun test(s: Slice) {
        s.loadBit(); // Bad
        s.loadInt(4); // Bad

        self.loadBit(); // OK
        let b = s.loadBool(); // OK
    }
}
