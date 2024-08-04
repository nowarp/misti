struct S {
    a: Int;
}

contract Test {
    receive("test") {
        let s: S = S {
            a: 1,
        };
        let i: Int = 0;
        while (i < s.a) { // no false positive
            i += 1;
        }
    }
}
