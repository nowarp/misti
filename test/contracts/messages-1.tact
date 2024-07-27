message M {
    value: Int as uint32;
}

contract A {
    val: Int as uint32 = 0;
    receive("increment") {
        self.val = self.val + 1;
        self.reply(M{value: self.val}.toCell());
    }
    receive("query") {
        self.reply(M{value: self.val}.toCell());
    }
}
