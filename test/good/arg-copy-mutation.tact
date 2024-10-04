const WHATEVER: Int = 0;

contract Test {
    m: map<Int, Int>;
    fun test(a: Int, m: map<Int, Int>) {
        m.set(3, 3); // Bad

        // OK: No warning since nobody will expect an integral type to be modified
        a += 1;
        a = 42;

        // OK: Accessing map element
        let _b: Int? = m.get(3);

        // OK: Modifying contract fields
        self.m.set(3, 3);
    }

    // To ensure we report the argument once per function
    fun testOnce(m: map<Int, Int>) {
        m.set(1, 1);
        m.set(2, 2);
    }

    fun id(m: map<Int, Int>): map<Int, Int> {
        return m;
    }

    // OK: The modified argument returned from all the branches
    fun testReturn1(m: map<Int, Int>): map<Int, Int> {
        m.set(3, 3); // OK
        if (WHATEVER == 0) {
            return m;
        } else {
            return self.id(m);
        }
    }
    // Bad: One of the branches returns something else
    fun testReturn2(m: map<Int, Int>): map<Int, Int> {
        m.set(3, 3); // Bad
        if (WHATEVER == 0) {
            return m;
        } else {
            let mCopy: map<Int, Int> = m;
            return mCopy; // Bad
        }
    }
}
