contract C {
    m: map<Address, Int>;

    receive(s1: Slice) {
        let a = s1.loadAddress();

        send(SendParameters{ to: a, value: 0, bounce: false, body: emptyCell() }); // Bad
        self.m.set(a, 42); // Bad
        self.m.del(a); // Bad

        if (a != newAddress(0, 0)) {
            self.m.set(a, 42); // OK
        }
        self.m.set(a, 42); // OK: there was a condition above

        if (self.checkAddr(a)) {
            self.m.set(a, 42); // OK
        }
    }

    fun checkAddr(a: Address): Bool {
        return a != newAddress(0, 0);
    }
}
