fun fun1() {}
fun fun2(): Int { return 42; }
fun test() {
    fun1(); // OK
    fun2(); // Bad
    1; // Bad
    1 == 1; // Bad

    let a = 42;
    a == 43; // Bad

    require(1 == 1, "1"); // OK: This function is not defined in AST
}

// Check contract methods
contract C1 {
    fun method1() {} // to check method name collision with C2.method1
    fun test() {
        self.method1(); // OK: Calling method returning void
    }
}
contract C2 {
    fun method1(): Int { return 42; }
    fun test() {
        self.method1(); // Bad: Calling method returning Int
    }
}

// Check methods defined in parent traits
trait T1 {
    fun traitMethod1(): Int { return 42; }
    fun traitMethod2() {}
}
trait T2 with T1 { fun traitMethod3(): Int { return 42; } }
contract CT with T2 {
    fun test() {
        self.traitMethod1(); // Bad
        self.traitMethod2(); // OK
        self.traitMethod3(); // Bad
    }
}
