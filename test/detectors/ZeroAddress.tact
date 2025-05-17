contract SampleContract {
    init(addr: Address) {
        newAddress(1, 0x000000000000000000000000000000000000000000000000); // Bad
        require(addr != newAddress(0, 0), "no false positive");
    }
}
