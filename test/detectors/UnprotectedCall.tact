contract C {
    receive(sc: Slice) {
        let a = sc.loadAddress();
        send(SendParameters{
                to: a,
                value: 0,
                bounce: false,
                body: emptyCell(),
        });
    }
}
