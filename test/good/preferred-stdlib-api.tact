message Msg {
    whatever: Slice as remaining;
}

contract Test {
    receive(msg: Msg) {
        let pkg: Slice = msg.whatever;
        let _seqno: Int = pkg.loadInt(32);
        let mode: Int = pkg.loadInt(8);
        let body: Cell = pkg.loadRef();
        nativeSendMessage(body, mode); // Bad: prefer `send`
    }

    fun getInt(): Int {
        return nativeRandom(); // Bad: prefer `randomInt`
    }
}
