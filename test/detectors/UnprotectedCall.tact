message Mint {
    new_owner: Address;
}

contract C {
    m: map<Address, Int>;
    ms: map<Int, Cell>;
    mss: map<Int, Int>;

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
        self.called(s1); // OK: NYI

        // Guarded (good) cases:
        if (a != newAddress(0, 0)) { self.m.set(a, 42); } // OK
        self.m.set(a, 42); // OK
        if (self.checkAddr(a)) { self.m.set(a, 42); } // OK
    }
    receive(s: String) {
        require(self.mss.isEmpty(), "check");
        self.mss.set(42, s.hashData()); // OK: guarded
    }
    receive(m: Mint) {
        let ctx: Context = context();
        let msg_value = ctx.value;
        send(SendParameters{ to: sender(), value: msg_value }); // Bad

        require(self.m.exists(sender()), "access denied"); // Guard
        self.mint(m.new_owner, msg_value);
        send(SendParameters{ to: sender(), value: msg_value }); // OK
    }

    // Private functions
    fun uncalled(s1: Slice) {
        let a = s1.loadAddress();
        self.m.set(a, 42); // OK: `uncalled` is never called
    }
    fun called(s1: Slice) {
        let a = s1.loadAddress();
        self.m.set(a, 42); // Bad *iff* called without guard
    }
    fun mint(new_owner: Address, msg_value: Int) {
        send(SendParameters{ to: sender(), value: msg_value }); // OK: guarded in the callsite
    }

    // Utility functions
    fun checkAddr(a: Address): Bool { return a != newAddress(0, 0); }
}
