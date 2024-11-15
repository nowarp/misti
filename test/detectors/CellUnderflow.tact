fun refs_num_bad(c: Cell) {
    let s1 = beginCell().storeRef(c).endCell().asSlice();
    let ref1 = s1.loadRef(); // OK
    let ref2 = s1.loadRef(); // Bad: Cell Underflow
}
