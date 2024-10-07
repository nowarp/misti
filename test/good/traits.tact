trait T {
  abstract get fun getter(): Int;
  abstract const something: Int;
}

contract TestContract with T {
  override get fun getter(): Int { return 0 }
  override const something: Int = 42;
}

trait V {
  a: Int;
  get fun getter(): Int {
      return self.a + 1; // a is used
  }
}

contract TestContract with V {
    a: Int = 42;
    fun test() {}
}

trait TParent {
  a: Int;
  fun getA(): Int {
      return self.a; // a is used
  }
}

trait TChild with TParent {
  a: Int;
}

contract TestContract with TChild {
    a: Int = 19;
    fun test(): Int {
        return self.getA();
    }
}