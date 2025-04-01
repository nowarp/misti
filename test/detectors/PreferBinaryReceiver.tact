message(1) One {}

contract Example {
    receive("one") { } // Bad
    external("two") { } // Bad

    receive(_: One) { } // OK
    receive(_: String) { } // OK
    receive() { } // OK
    external(_: One) { } // OK
    external(_: String) { } // OK
    external() { } // OK
    bounced(_: Slice) { } // OK
}
