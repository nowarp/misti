contract Test {
    m: map<Int, Int>;
    fun test(a: Int, m: map<Int, Int>) {
        // Bad cases:
        m.set(3, 3);
        m.del(3);

        // OK: No warning since nobody will expect an integral type to be modified
        a += 1;
        a = 42;

        // OK: Accessing map element
        let _b: Int? = m.get(3);

        // OK: Modifying contract fields
        self.m.set(3, 3);
    }
}
