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

// Additional test

struct Msg {
    a: Int;
}


contract SendInLoop {
    owner: Address;
    a: Int;

    init(owner: Address) {
        self.owner = owner;
        self.a = 0;
    }

    fun sendMessage(i: Int) {
        send(SendParameters{
            to: self.owner,
            value: 0,
            bounce: false,
            body: Msg{ a: i }.toCell()
        });
    }

    // Function that calls another function which calls send
    fun indirectSend(i: Int) {
        self.sendMessage(i);
    }

    fun exampleIndirectLoop(limit: Int) {
        let i = 0;
        while (i < limit) {
            i += 1;
            self.indirectSend(i);
        }
    }
}

//Additional test

contract ComplexIndirectSend {
    owner: Address;

    init(owner: Address) {
        self.owner = owner;
    }

    // Indirect send via multiple function layers
    fun deepNestSend(value: Int) {
        send(SendParameters{
            to: self.owner,
            value: value
        });
    }

    fun intermediateCall(value: Int) {
        self.deepNestSend(value);
    }

    fun outerLoopFunction(limit: Int) {
        let i = 0;
        while (i < limit) {
            self.intermediateCall(i);
            i += 1;
        }
    }

    // Recursive indirect send
    fun recursiveSend(depth: Int, currentValue: Int) {
        if (depth > 0) {
            send(SendParameters{
                to: self.owner,
                value: currentValue
            });
            self.recursiveSend(depth - 1, currentValue + 1);
        }
    }

    // Conditional indirect send within loop
    fun conditionalIndirectSend(items: map<Int, Int>) {
        foreach (key, value in items) {
            if (value > 0) {
                self.deepNestSend(value);
            }
        }
    }
}