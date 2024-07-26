contract FieldTest {
    f1: Address;
    f2: Int as uint256 = 0;

    init() {
        self.f1 = sender();
    }

    get fun use_f1(): Address {
        return self.f1;
    }
}
