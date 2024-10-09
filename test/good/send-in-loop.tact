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