contract FieldTest {
    f1: Address;
    f2: Int as uint256 = 0;
    foreachmap: map<Address, Address>;

    init() {
        self.f1 = sender();
    }

    get fun use_f1(): Address {
        return self.f1;
    }

    fun forEachUse() {
        // No warning: foreachmap is used
        let foreachmap: map<Address, Address> = self.foreachmap;
        foreach (_, _ in foreachmap) {}
    }
}
