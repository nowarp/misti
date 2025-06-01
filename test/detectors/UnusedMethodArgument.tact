contract Test {
    a: Int = 0;
    b: Int = 0;

    fun inc1(a: Int): Int { return a + 1; }
    fun inc2(a: Int): Int { return a + 1; }
    fun inc3(a: Int): Int { return a + 1; }
    fun inc4(a: Int): Int { return a + 1; }
    fun inc5(a: Int): Int { return a + 1; }
    fun inc6(a: Int): Int { return a + 1; }
    fun inc7(a: Int): Int { return a + 1; }
    fun inc8(a: Int): Int { return a + 1; }
    fun inc_unused(a: Int): Int { return a + 1; }

    receive() {
        // Bad: The same field is used
        self.inc1(self.b);

        // Bad: The same field is used
        self.inc2(self.a);
        self.inc2(self.a);

        // OK: Binary expression is used
        self.inc3(self.a + 1);
        self.inc3(self.a + 1);

        // OK: Different fields
        self.inc4(self.a);
        self.inc4(self.b);

        // OK: Different constants
        self.inc5(1);
        self.inc5(2);

        // Bad: The same constant is used
        self.inc6(2);
        self.inc6(2);

        // Bad: The same constant is used
        self.inc7(1);

        // OK: Local variable is used
        let a: Int = 42;
        self.inc8(a);
        self.inc8(a);

        // OK: stdlib calls
        let sb: StringBuilder = beginString();
        sb.append("a");
    }
}
