// NOTE: This example won't compile after updating Tact to 1.4.1
contract ConstantFieldTest {
    const val: Int = ton("0.01");
    fun test() {
        send(SendParameters{
            to: sender(),
            bounce: true,
            value: self.val,
            mode: SendRemainingValue + SendIgnoreErrors
        });
    }
}

