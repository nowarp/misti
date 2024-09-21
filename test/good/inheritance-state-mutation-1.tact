trait T {
  balance: Int;
}

contract C with T {
  balance: Int = 42;
  fun updateBalance() {
    self.balance = 100; // Suspicious: Highlighted by the detector
  }
}
