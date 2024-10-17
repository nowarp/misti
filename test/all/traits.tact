trait T {
  abstract get fun getter(): Int;
  abstract const something: Int;
}

contract TestContract with T {
  override get fun getter(): Int { return 0 }
  override const something: Int = 42;
}

trait Z {
  a: Int;
  get fun getter(): Int {
      return self.a + 1;
  }
}

contract TestContractF {
    a: Int = 42;
    fun test() {}
}

trait TParent {
  a: Int;
  fun getA(): Int {
      return self.a;
  }
}

trait TChild with TParent {
  a: Int; // Declare 'a' to satisfy TParent's requirement
}

contract TestContractT with TChild {
    a: Int = 19;
    fun test(): Int {
        return self.getA();
    }
}