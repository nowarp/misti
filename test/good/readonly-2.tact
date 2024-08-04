fun test() {
    let a: Int = 10; // warning: read-only variable
    repeat (a) { /* do nothing */ }
    repeat (a) { /* ... */ }
}
