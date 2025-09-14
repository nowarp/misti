fun bad1(): Int { return + 1; } // Bad
fun ok1(): Int { return - 1; } // OK
fun ok2(a: Int): Int { return a + 1; } // OK

contract C {
    field1: Int = 0;
    field2: Int = +1; // OK

    receive() {
        let a = +1; // Bad
        let b = -1; // OK
        a += 1; // OK
        a = b; // OK
        a = +b; // OK
        a = -b; // OK
        a = 1 + 1; // OK
        a = b + b; // OK

        self.field1 = +1; // Bad
        self.field1 = -1; // OK
        self.field1 += 1; // OK
        self.field1 = a + 1; // OK
    }
}
