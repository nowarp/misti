trait T {
  a: Int;
  get fun getter(): Int {
      return self.a + 1; // a is used
  }
}

contract TestContract with T {
    a: Int = 42;
    fun test() {}
}

