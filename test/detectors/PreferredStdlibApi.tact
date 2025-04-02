message Msg {
    whatever: Slice as remaining;
}

contract Test {
    receive(msg: Msg) {
        let slice1: Slice = emptyCell().asSlice();  // Bad: use emptySlice()
        let cell1: Cell = beginCell().endCell();    // Bad: use emptyCell()
        let pkg: Slice = msg.whatever;
        let _seqno: Int = pkg.loadInt(32);
        let mode: Int = pkg.loadInt(8);
        let body: Cell = pkg.loadRef();
        nativeSendMessage(body, mode); // Bad: prefer `send`
        require(mode > 8, "foo"); // Bad: prefer `throwUnless`
    }

    fun getInt(): Int {
        return nativeRandom(); // Bad: prefer `randomInt`
    }
}
