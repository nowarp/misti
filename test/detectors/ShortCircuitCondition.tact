contract ShortCircuitTest {
    a: Int = 5;

    fun test() {
      require(self.a > 0 && self.expensiveCheck(), ""); // OK
      require(now() > 5000 && self.a > 0, ""); // OK: now() is cheap

      require(self.expensiveCheck() && (self.a > 10), ""); // Bad
      require(true || self.expensiveCheck(), ""); // Bad
      require((self.a > 0) && self.expensiveCheck() && false, ""); // Bad
      if ((self.expensiveCheck() && (self.a < 3)) || ((self.a > 10) && true)) {} // Bad
    }

    fun expensiveCheck(): Bool { return true; }
}
