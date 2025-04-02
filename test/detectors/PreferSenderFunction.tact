fun test(_: Int) {}

contract A {
    receive("1") {
        let s = context().sender; // Bad: replace w/ sender()
    }
    receive("2") {
        let ctx = context(); // Bad: Only .sender is accessed
        let s = ctx.sender;
    }
    receive("3") {
        let ctx = context(); // OK
        let s = ctx.sender;
        let v = ctx.value;
    }
    receive("4") {
        let ctx = context(); // OK; no context-sensitivity
        let s = ctx.sender;
        if (false) { let v = ctx.value; }
    }
    receive("5") {
        let ctx = context(); // OK
        let s = ctx.sender;
        test(ctx.value);
    }
    receive("6") {
        let ctx = context(); // OK
        let s = ctx.sender;
        let fee = ctx.readForwardFee();
    }
}

