contract TestContract {
    // Bad: Example of redundant if statement
    fun redundantIf(condition: Bool): Bool {
        if (condition) {
            return true;
        } else {
            return false;
        }
    }

    // Bad: Example of redundant boolean comparison
    fun redundantComparison(a: Bool): Bool {
        return a == true;
    }

    // Bad: Example of redundant ternary expression
    fun redundantTernary(b: Bool): Bool {
        return b ? true : false;
    }

    // Ok: Correct usage (should not trigger warnings)
    fun correctUsage(condition: Bool): Bool {
        return condition;
    }
}
