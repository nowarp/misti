contract Main {
  proxy: Address;
  init(addr: Address) {
    // Bad: Constant address highlighted by the analyzer.
    self.proxy = address("UQBKgXCNLPexWhs2L79kiARR1phGH1LwXxRbNsCFF9doczSI");
    require(addr != address("UQBKgXCNLPexWhs2L79kiARR1phGH1LwXxRbNsCFF9doczSI"), "no false positive");
  }
}
