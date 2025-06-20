fun eval(): Int { return 42; }

trait T {
    abstract fun inherited(): Int;
}

contract Test with T {
    field: Int = 0;

    override fun inherited(): Int { return 42; } // OK: inherited from trait
    fun getField(a: Int): Int { return self.field; } // OK: field is used
    fun callId(a: Int): Int { return self.id(42); } // OK: method is called

    fun id(a: Int): Int { return a; } // Bad
    fun get42(): Int { return 42; } // Bad
    fun getEval(): Int { return eval(); } // Bad

    get fun getter(): Int { return self.field }
}
