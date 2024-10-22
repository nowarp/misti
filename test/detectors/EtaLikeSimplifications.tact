contract TestContract {
    // Example of redundant if statement
    fun redundantIf(condition: Bool): Bool {
        if (condition) {
            return true;
        } else {
            return false;
        }
    }

    // Example of redundant boolean comparison
    fun redundantComparison(a: Bool): Bool {
        return a == true;
    }

    // Example of redundant ternary expression
    fun redundantTernary(b: Bool): Bool {
        return b ? true : false;
    }

    // Correct usage (should not trigger warnings)
    fun correctUsage(condition: Bool): Bool {
        return condition;
    }
}
