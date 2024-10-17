fun f(): Int { return 42; }
fun fOpt(): Int? { return null; }

fun use(_a: Int?) {}

message M {
    field: Int?;
}

trait T {
}

contract C with T {
    // Bad: Unused field
    _f1: Int? = 12;

    // OK: Fields are used
    _f2: Int? = 12;
    _f3: Int? = 12;
    _f4: Int? = 12;

    // OK: Don't report optionals coming from structure/message fields, since
    // we might not have information about their types in the detector.
    receive(m: M) {
        let _a: Int? = m.field;
        self._f4 = m.field;
    }

    receive("whatever") {
        // Bad: checking that the detector works in receivers
        let _a: Int? = 12;
    }

    fun test() {
        // OK: We don't report values resulting from function calls
        let _a1: Int? = f();
        let _a2: Int? = fOpt();
        let _a3: Int? = self.m();
        let _a4: Int? = self.mOpt();

        // Bad: unused optionals will be reported
        let _a5: Int? = 12;
        let _a6: Int? = 12;
        _a6!!;

        // OK: Optional is used
        let _a7: Int? = 12;
        if (_a7 == null) {}
        let _a8: Int? = 12;
        if (null == _a8) {}
        let _a9: Int? = 12;
        use(_a9);

        // OK: Field is unused, but we intentionally skip field access operations
        let _a10: Int = self._f1!!;

        // OK: Used fields
        use(self._f2);
        if (self._f3 == null) {}
    }

    fun m(): Int { return 42; }
    fun mOpt(): Int? { return null; }
}
