message Msg {
    a: Int;
}

contract SendInLoopExamples {
    owner: Address;

    init(owner: Address) {
        self.owner = owner;
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

    // Example 5: Send function inside a potentially infinite loop

    fun exampleInfiniteLoop() {
        let i = 0;
        while (true) {
            i += 1;
            send(SendParameters{
                to: self.owner,
                value: 0,
                bounce: false,
                mode: SendRemainingValue,
                body: Msg{ a: i }.toCell()
            });
            if (i >= 10) {
                // Missing break; loop condition is always true
            }
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

    // Example 7: Loop that may cause out-of-gas exception

    fun exampleOutOfGasLoop() {
        let i = 0;
        repeat (1_000_001) {
            i += 1;
            // Optional: send function here if you want to test send in large loops
            // send(SendParameters{ ... });
        }
        dump(i);
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
