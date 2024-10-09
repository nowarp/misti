message Msg {
    a: Int;
}

contract T {
    fun tWhile(){
        let x: Int = 10;
while (x > 0) {
  // Bad: x is not changed due looping
  send(SendParameters{ to: sender(), value: x });
}
    }
}

contract Z {
    fun zWhile(){
        let x: Int = 10;
        while (x > 0) {
            // OK: Should not trigger!
            send(SendParameters{ to: sender(), value: x });
            x = x - 1; // Decrement inside the loop
        }
    }
}


contract SendInLoopExamples {
    owner: Address;
    a: Int;

    init(owner: Address) {
        self.owner = owner;
        self.a = 0;
    }

    // Example 1: Send function inside a while loop
    fun exampleWhileLoop(limit: Int) {
        let i = 0;
        while (i < limit) {
            i += 1;
            send(SendParameters{
                to: self.owner,
                value: 0,
                bounce: false,
                mode: SendRemainingValue,
                body: Msg{ a: i }.toCell()
            });
        }
    }

    // Example 2: Send function inside a repeat loop
    fun exampleRepeatLoop() {
        let i = 0;
        repeat (5) {
            i += 1;
            send(SendParameters{
                to: self.owner,
                value: 0,
                bounce: false,
                mode: SendRemainingValue,
                body: Msg{ a: i }.toCell()
            });
        }
    }

    // Example 3: Send function inside nested loops
    fun exampleNestedLoops() {
        let i = 0;
        while (i < 3) {
            i += 1;
            let j = 0;
            while (j < 2) {
                j += 1;
                send(SendParameters{
                    to: self.owner,
                    value: 0,
                    bounce: false,
                    mode: SendRemainingValue,
                    body: Msg{ a: i * 10 + j }.toCell()
                });
            }
        }
    }

    // Example 4: Send function inside a loop within an if condition
    fun exampleLoopInIfCondition(flag: Bool) {
        if (flag) {
            let i = 0;
            while (i < 4) {
                i += 1;
                send(SendParameters{
                    to: self.owner,
                    value: 0,
                    bounce: false,
                    mode: SendRemainingValue,
                    body: Msg{ a: i }.toCell()
                });
            }
        }
    }

    // Example 5: Send function inside a loop with adjusted condition
    fun exampleInfiniteLoop() {
        let i = 0;
        while (i < 10) { // Adjusted condition to prevent infinite loop
            i += 1;
            send(SendParameters{
                to: self.owner,
                value: 0,
                bounce: false,
                mode: SendRemainingValue,
                body: Msg{ a: i }.toCell()
            });
        }
    }

    // Example 6: Send function inside a loop within a try-catch block
    fun exampleTryCatchLoop() {
        try {
            let i = 0;
            while (i < 5) {
                i += 1;
                send(SendParameters{
                    to: self.owner,
                    value: 0,
                    bounce: false,
                    mode: SendRemainingValue,
                    body: Msg{ a: i }.toCell()
                });
            }
        } catch (e) {
            // Handle exception
        }
    }


    // Example 8: Send function outside of loops (should not trigger warning)
    fun exampleNoLoop() {
        send(SendParameters{
            to: self.owner,
            value: 0,
            bounce: false,
            mode: SendRemainingValue,
            body: Msg{ a: 0 }.toCell()
        });
    }

}

contract Test {
    fun tWhile() { 
        let i: Int = 0;
        while (i < 10) {
            send(SendParameters{
                to: sender(),
                value: i,
            });
            i = i + 1;
        }
    }

    fun tRepeat() { 
        repeat (10) {
            send(SendParameters{
                to: sender(),
                value: 0,
            });
        }
    }

    fun tUntil() {
        let i: Int = 0;
        do {
            send(SendParameters{
                to: sender(),
                value: i,
            });
            i = i + 1;
        } until (i == 10);
    }

    fun tForeach() {
        let m: map<Int, Int> = emptyMap();
        foreach (k, v in m) {
            send(SendParameters{
                to: sender(),
                value: v,
            });
        }
    }

    fun tNested() {
        let i: Int = 0;
        while (i < 10) {
            repeat (10) {
                send(SendParameters{
                    to: sender(),
                    value: i,
                });
            }
            i = i + 1;
        }
    }
}