const WHATEVER: Bool = true;

const a: String = "foo";

contract Test {
    receive("test") {}
    receive(msg: String) {
        // Simple cases
        if (msg == "test") {} // Bad
        if ("test" != msg) {} // Bad
        if (("test" != msg) && WHATEVER) {} // Bad
        if ((WHATEVER || WHATEVER) && ("test" != msg)) {} // Bad

        // Local variables tainted with `msg`
        let foo: String = msg;
        let bar = foo;
        if ("test" == bar) {} // Bad

        // Local variables tainted with `"test"`
        let test1: String = "test";
        let test2 = test1;
        if (test2 == msg) {} // Bad

        // Combining tainted cases
        if (test2 != bar) {} // Bad
        if (bar == test2) {} // Bad

        // No false positives
        if ("test" != a) {}
    }
}
