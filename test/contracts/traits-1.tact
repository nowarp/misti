trait T {
  abstract get fun getter(): Int;
  abstract const something: Int;
}

contract TestContract with T {
  override get fun getter(): Int { return 0 }
  override const something: Int = 42;
}
