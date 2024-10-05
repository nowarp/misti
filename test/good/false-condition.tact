fun test(): Int {
    // OK: Accept empty conditions
    if (false) {}
    while (false) {}
    do {} until(false);
    repeat (0) {}

    // Bad
    if (false) { return 1; }
    if (false) { return 1; } else if (false || false) { return 2; }
    while (false) { return 1; }
    repeat (0) { return 1; }
    return (false && true) ? 1 : 2;
}
