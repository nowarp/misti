contract TestSuspiciousLoops {
    
    fun testWhileInfinite() { 
        let i: Int = 0;
        while (true) { // This should be flagged for an unbounded condition
            i = i + 1;
        }
    }

    fun testRepeatHighCount() { 
        repeat (1_000_001) { // This should be flagged for excessive iteration
            let x = 1;
        }
    }

    fun testWhileLargeLimit() {
        let i: Int = 0;
        while (i < 1_000_000) { // This should be flagged for large constant comparison
            i = i + 1;
        }
    }

    fun testNestedLoops() {
        let i: Int = 0;
        while (i < 10) {
            repeat (1_000_000) { // Should be flagged within nested loop
                i = i + 1;
            }
        }
    }

    fun testLoop() {
    let a: Int = 0;
    while (false) { // Should be flagged for dead code
        a = 10000000; true; 
     } 
}
}
