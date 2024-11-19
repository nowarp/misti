fun refs_underflow(c: Cell) {
    let s1 = beginCell()
               .storeRef(c)
               .endCell()
               .asSlice();
    let ref1 = s1.loadRef(); // OK
    let ref2 = s1.loadRef(); // Bad: Cell Underflow

    beginCell() // Bad: Cell Underflow
      .endCell()
      .asSlice()
      .loadRef();
}

fun refs_overflow(c: Cell) {
    // Cell Overflow when storing a known local builder
    let b1 = beginCell()
               .storeRef(c)
               .storeRef(c)
               .storeRef(c)
               .storeRef(c); // OK: Builder storing 4 references
    let c1 = beginCell() // Bad: We got 5 references
               .storeBuilder(b1)
               .storeRef(c)
               .endCell();

    let c2 = // Bad: 4+ refs
    beginCell()
        .storeRef(c)
        .storeRef(c)
        .storeRef(c)
        .storeRef(c)
        .storeRef(c)
        .endCell();

   let b2 = beginCell();
   b2 = b2.storeRef(c);
   b2 = b2.storeRef(c);
   b2 = b2.storeRef(c);
   b2 = b2.storeRef(c);
   b2 = b2.storeRef(c); // Bad: 4+ refs
   let c3 = b2.endCell(); // Bad: 4+ refs

   let b3 = b2;
   let c4 = b3.endCell(); // Bad: 4+ refs
}

fun refs_num_ok(c: Cell, copt: Cell?) {
    let c1 = // OK: Cell could be None (no taint analysis yet)
    beginCell()
        .storeRef(c)
        .storeRef(c)
        .storeRef(c)
        .storeMaybeRef(copt)
        .storeRef(c)
        .endCell();

    // OK: no assignments to the result of storeRef calls
    let b1 = beginCell();
    b1.storeRef(c);
    b1.storeRef(c);
    b1.storeRef(c);
    b1.storeRef(c);
    b1.storeRef(c);
    c1 = b1.endCell();
}
