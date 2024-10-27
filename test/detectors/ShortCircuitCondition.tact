contract ShortCircuitTest {
    a: Int = 5;

    // Test 1: Unoptimized && condition, should warn to reorder
    fun testCondition1(): Bool {
        return (self.expensiveCheck() && (self.a > 10)); // Bad
    }

    // Test 2: Unoptimized || condition, should warn to reorder
    fun testCondition2(): Bool {
        return (true || self.expensiveCheck());  // Bad
    }

    // Test 3: Complex condition with both optimized and unoptimized parts
    fun testCondition3(): Bool {
        return ((self.a > 0) && self.expensiveCheck() && false); //Bad: Should warn for moving false left
    }

    // Test 4: Nested conditions
    fun testCondition4(): Bool {
        if ((self.expensiveCheck() && (self.a < 3)) || ((self.a > 10) && true)) {
            return true; // Bad: Should warn for moving constants to the left
        }
        return false;
    }

    // Test 5: No optimization needed, should not warn
    fun testCondition5(): Bool {
        return (self.a > 0 && self.expensiveCheck()); // Ok
    }

    fun expensiveCheck(): Bool {
        return true;
    }
}
