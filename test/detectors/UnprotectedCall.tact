contract C {
    m: map<Address, Int>;

    receive(s1: Slice) {
        let a = s1.loadAddress();
        send(SendParameters{ // Bad
                to: a,
                value: 0,
                bounce: false,
                body: emptyCell(),
        });

        self.m.set(a, 42); // Bad
        self.m.del(a); // Bad
    }
}
