trait T {
  balance: Int;
  fun setBalance(newBalance: Int) {
    require(newBalance > 0, "balance cannot be negative"); // Invariant check
    self.balance = newBalance;
  }
}

contract C with T {
  balance: Int = 42;
  fun updateBalance() {
    self.setBalance(100); // OK: Invariant preserved
  }
}
