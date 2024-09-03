const WHATEVER: Bool = true;

contract Test {
    receive("test") {}
    receive(msg: String) {
        if (msg == "test") {} // Bad
        if ("test" != msg) {} // Bad
        if (("test" != msg) && WHATEVER) {} // Bad
        if ((WHATEVER || WHATEVER) && ("test" != msg)) {} // Bad

        // No false positives
        let a: String = "foo";
        if ("test" != a) {}
    }
}
