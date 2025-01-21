contract TimestampTest {
    value: Int;
    init() {
        self.value = now();  //BAD in Assignment
    }

    // Test basic variable declaration
    receive("test1") {
        let time: Int = now();  //BAD in var declaration
        self.value = time;
    }

    receive("foobar") {
        let v: Int = 0;
        if (self.value == 3) { // Bad
            v = now();
        }
        if (v > 3) { // Bad
            v += 1;
        }
        let v1: Int = v;
        if (v1 > 500) {} // Bad
        let v2: Int = 42;
        if (true) { v2 = v1; }
        if (v2 > 5) {} // Bad
    }

    // Test loops
    receive("test2") {
        let start: Int = now();  //BAD in var declaration
        
        // While loop
        while (now() < start + 1000) {
            self.value += 1;
        }
        
        // Repeat loop
        repeat(10) {
            self.value = now();
        }
        
        // Until loop
        do {
            self.value = self.value + 1;
        } until (now() > start + 2000);
    }

    // Test returns
    fun getTimestamp(): Int {
        return now();
    }

    // Test augmented assignment
    receive("test3") {
        self.value += now();
    }

    // Test expressions
    receive("test4") {
        if (self.value != 0) {
            self.value = now() * 2;
        }
    }
}