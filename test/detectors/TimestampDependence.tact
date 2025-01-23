struct Data {
    time: Int;
    value: Int;
}

contract SimpleTimestampTest {
    timestamp: Int;
    data: Data;

    init() {
        self.timestamp = now();  //BAD: Assignment uses now()
        self.data = Data {
            time: now(),         //BAD: Struct initialization with now()
            value: 0
        };
    }

    // Test arithmetic with tainted fields
    receive("test_arithmetic") {
        let temp: Int = self.data.time * 2;  //BAD: Tainted multiplication
        let sum: Int = self.timestamp + self.data.time;  //BAD: Tainted addition

        if (temp > 0) {  //BAD: Condition depends on tainted temp
            self.data.value = 1;
        }

        if (sum < 100) {  //BAD: Condition depends on tainted sum
            self.timestamp = sum;  //BAD: Propagating taint
        }

        let compound: Int = (self.data.time * 2) + (self.timestamp / 3);  //BAD: Compound tainted operation
        if (compound != 0) {  //BAD: Condition depends on compound
            self.data.value += 1;
        }
    }

    // Test variable declaration
    receive("test_variable") {
        let time: Int = now();  //BAD: Variable declaration with now()
        self.timestamp = time; //BAD: Assigning tainted variable
    }

    // Test loops
    receive("test_loops") {
        let start: Int = now();  //BAD: Variable initialization with now()

        while (now() < start + 1000) {  //BAD: Loop condition depends on now()
            self.timestamp += 1;
        }

        repeat(5) {
            self.timestamp = now();  //BAD: Repeat loop with now()
        }

        do {
            self.timestamp += 1;
        } until (now() > start + 2000);  //BAD: Until condition depends on now()
    }

    // Test returns
    fun getTimestamp(): Int {
        return now();  //BAD: Returning now() directly
    }

    // Test expressions
    receive("test_expressions") {
        let result: Int = now() > 0 ? now() : 0;  //BAD: Ternary operator with now()
        self.timestamp = result;                 //BAD: Assigning tainted result
    }
}

contract TimestampEdgeCaseTest {
    taintedValue: Int;
    timestamp: Int;

    init() {
        self.taintedValue = 0;
        self.timestamp = 0;
    }

    receive("test_edge_cases") {
        let a: Int = now() > 10 ? 42 : now();  //BAD: Ternary operator with now()
        self.helperFunction(now());           //BAD: Function call with now()
        self.taintedValue = self.helperFunction(now());  //BAD: Assigning tainted return value

        let nested: Int = (now() > 0 ? self.taintedValue : 0) + 
                         (self.helperFunction(now()) * 2);  //BAD: Nested tainted operations
    }

    fun helperFunction(x: Int): Int {
        return x + 1;  // Propagates taint
    }

    fun getTainted(): Int {
        return now(); //BAD: Returning tainted timestamp
    }

    receive("test_function") {
        self.timestamp = self.getTainted(); //BAD: Assigning tainted return value
    }
}
