fun refs_num_bad(c: Cell) {
    let s1 = beginCell()
               .storeRef(c)
               .endCell()
               .asSlice();
    let ref1 = s1.loadRef(); // OK
    let ref2 = s1.loadRef(); // Bad: Cell Underflow

    beginCell()
        .endCell()
        .asSlice()
        .loadRef(); // Bad: Cell Underflow

    // Cell Overflow when storing a known local builder
    let b1 = beginCell()
               .storeRef(c)
               .storeRef(c)
               .storeRef(c)
               .storeRef(c); // OK: Builder storing 4 references
    let c1 = beginCell()
               .storeBuilder(b1)
               .storeRef(c) // Bad: We got 5 references
               .endCell();
}
