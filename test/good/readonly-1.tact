fun test(): Int {
    let a: Int = 10; // Warning: read-only variable
    return a;
}

contract Test {
    m: map<Int, Int>;
    get fun test(a: Int): Bool {
        let result: Int? = self.m.get(a); // OK: Cannot create a constant yet
        if (result == 1) {
            return true;
        }
        return false;
    }
}
