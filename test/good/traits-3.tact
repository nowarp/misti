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
