contract TestContract {
    receive() {
        let _test: Int = 123; // suppressed: no warning
    }
}
