contract A { init() {} }
contract B {
    owner: Address;
    init(owner: Address) { self.owner = owner; }
    receive() {
        let init = initOf A();
        send(SendParameters{ // Bad: Prefer deploy
            to: contractAddress(init),
            code: init.code,
            data: init.data,
            value: 0,
            body: beginCell().endCell(),
        });
        send(SendParameters{ // OK
            to: self.owner,
            value: 0,
            bounce: false,
            body: beginCell().endCell()
        });
    }
}
