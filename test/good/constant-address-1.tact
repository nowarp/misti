contract Main {
  proxy: Address;
  init() {
    // Bad: Constant address highlighted by the analyzer.
    self.proxy = address("UQBKgXCNLPexWhs2L79kiARR1phGH1LwXxRbNsCFF9doczSI");
  }
}
