contract C {
    m: map<Address, Int>;
    ms: map<Int, Cell>;

    // Entrypoints
    receive(s1: Slice) {
        let a = s1.loadAddress();
        let i = s1.loadInt(64);

        // Bad cases:
        send(SendParameters{ to: a, value: 0, bounce: false, body: emptyCell() }); // Bad
        send(SendParameters{ to: newAddress(0, 0), value: 0, bounce: false, body: s1.asCell() }); // Bad
        self.m.set(a, 42); // Bad
        self.m.del(a); // Bad
        self.ms.del(i+1); // Bad
        self.ms.set(42, s1.asCell()); // Bad

        // Guarded (good) cases:
        if (a != newAddress(0, 0)) { self.m.set(a, 42); } // OK
        self.m.set(a, 42); // OK
        if (self.checkAddr(a)) { self.m.set(a, 42); } // OK
    }

    // Utility functions
    fun checkAddr(a: Address): Bool { return a != newAddress(0, 0); }
}
