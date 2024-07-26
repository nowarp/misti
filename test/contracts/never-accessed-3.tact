contract FieldTest {
    f1: Address;
    init() {
        self.f1 = sender();
    }
}
