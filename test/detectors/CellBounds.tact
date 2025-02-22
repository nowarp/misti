// Test for: https://github.com/nowarp/misti/issues/270
struct R { a: Int; }
fun f() { let r = R { a: 0 }; repeat (1) { } }

struct S {
    a: Int;
    b: Int;
}

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

    // Test structures/messages
    let st1 = S {a: 1 , b: 2};
    let c1 = st1.toCell().asSlice().loadRef(); // Bad: Cell Underflow
    st1.toCell().asSlice().loadRef(); // Bad: Cell Underflow
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

fun data_overflow() {
    let b1 = beginCell();
    b1 = b1.storeInt(42, 257);
    b1 = b1.storeInt(42, 259-2);
    b1 = b1.storeInt(42, 256+1);
    b1 = b1.storeInt(42, 257); // Bad: 1023+ bits
    let c1 = b1.endCell(); // Bad: 1023+ bits

    let b2 = beginCell();
    b2 = b2.storeInt(1, 257)
           .storeInt(1, 257)
           .storeInt(1, 257)
           .storeInt(1, 210); // Total size: 981
    b2 = b2.storeCoins(40000000000); // Bad: 44 + 981 = 1025 => overflow
    c1 = b2.endCell(); // Bad

    let b_1000_bits = beginCell()
           .storeInt(1, 257)
           .storeInt(1, 257)
           .storeInt(1, 257)
           .storeInt(1, 229);
    let b3 = beginCell();
    b3 = b3.storeBuilder(b_1000_bits) // Bad: 1025 bits
           .storeInt(1, 25);
    c1 = b3.endCell(); // Bad: 1025 bits
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

fun data_ok() {
    // Should NOT trigger data underflow warning
    beginCell()
        .storeUint(2, 2)
        .storeUint(0, 1)
        .storeUint(0, 8)
        .storeUint(0, 256) // 267 total bits stored
        .endCell()
        .asSlice()
        .loadAddress(); // 267 bits loaded
}