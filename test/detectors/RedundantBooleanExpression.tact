contract Test {
    a: Int = 0;
    fun test() {
        if ((self.a == 1) || (self.a == 2)) {} // OK
        if ((self.a == 1) || (1 == self.a)) {} // OK: No AST comparison API available
        if ((self.a == 1) || (self.a != 1)) {} // OK
        if (((self.a == 1) && (self.a != 1)) || (self.a == 1)) {} // OK

        if ((self.a > 0) || (self.a > 0)) {} // Bad
        if ((self.a == 1) || (self.a != 0) || (self.a == 1)) {} // Bad
        if ((self.a == 1) && (self.a != 0) && (self.a == 1)) {} // Bad
    }
}

