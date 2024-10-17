const ONE: Int = 1;
const TWO: Int = ONE + 1;

fun toCall(): Int {
    return 42;
}

fun test1() {
    // Suggest pow2:
    pow(3, 2);
    pow(3, 1 + 1);

    // OK: consteval does not support constants yet
    pow(3, TWO);
    pow(3, ONE + ONE);

    // OK: ensure consteval doesn't crash
    pow(toCall(), toCall());
    pow(toCall(), toCall() + 1);
}
