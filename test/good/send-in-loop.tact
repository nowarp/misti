
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

    //Send function inside a while loop

    fun exampleWhileLoop(limit: Int) {
        let i = 0;
        while (i < limit) {
            i += 1;
         let a =  send(SendParameters{
                to: self.owner,
                value: 0,
                bounce: false,
                body: Msg{ a: i }.toCell()
            });
        }
    }

        // self.reply inside a loop
    fun testReply() {
        let i: Int = 0;
        while (i < 5) {
            self.reply(Msg{ a: i }.toCell());
            i = i + 1;
        }
    }
}




