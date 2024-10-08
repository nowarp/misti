contract Test {
    field: Int = 19;
    fun test() {
        let a: Int = 42;

        // Should be reported:
        a = a + 1;
        a = 1 + a;
        self.field = 1 + self.field;
        self.field = self.field + a;

        // Complex logic; should not be reported:
        self.field = self.field + a + 1;
        self.field = -self.field + a;
    }
}
