const TRUE: Bool = true;
const FALSE: Bool = false;
const A: Int = 1000;
const B: Int = 10000;

contract TestSuspiciousLoops {

    fun testWhileInfinite() {
        let i: Int = 0;
        while (true) { i = i + 1; } // Bad
        do { i = i + 1; } until (true); // Bad
        do { i = i + 1; } until (TRUE); // TODO: Unsupported in consteval
    }

    fun testRepeatHighCount() {
        repeat (10_001) { let x = 1; } // Bad
        repeat (A + B) { let x = 1; } // TODO: Unsupported in consteval
        repeat (A) { let x = 1; } // OK
    }

    fun testNestedLoops() {
        let i: Int = 0;
        while (i < 10) {
            repeat (1_000_000) { i = i + 1; } // Bad
        }
    }

    fun testLoop() {
        let a: Int = 0;
        while (false) { a = 1; } // Bad
        while (false) { } // OK: Empty body
        do { a = 1; } until (false); // OK: Until is allowed
        do {} until (false); // OK: Until is allowed
        while (TRUE && FALSE) { a = 1; } // TODO: Unsupported in consteval
    }
}
