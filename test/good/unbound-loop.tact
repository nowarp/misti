fun test1(): Int {
    let a: Int = 20; // read-only variable
    while (a > 10) { // ERROR: a is not changing within the loop
    }
    return a;
}

fun test2(): Int {
    let a: Int = 20; // read-only variable
    do  { // ERROR: a is not changing within the loop
    } until (a > 10);
    return a;
}

fun test3(): Int {
    let a: Int = 20;
    while (a > 10)  { // OK: a is changing within the loop
        a += 1;
    }
    return a;
}

fun test4(): Int {
  let a: Int = 10;
  repeat (a) {} // no warning, since the repeat is bounded by definition
  return a;
}

fun test5() {
    let i: Int = 0;
    while (i > 0) {} // WARNING: unbound loop
}

fun test6() {
    let i: Int = 0;
    while (10 < i) {} // WARNING: unbound loop
}


fun test7() {
    let i: Bool = false;
    while (i) {} // WARNING: unbound loop
}

fun test8() {
    let i: Bool = true;
    while (!i) {} // WARNING: unbound loop
}


fun fn(a: Int) {
}

fun test9(): Int {
    let a: Int = 20;
    while (a > 10)  { // OK: a is using within the loop
        fn(a);
    }
    return a;
}


struct S {
    a: Int;
}

contract Test {
    receive("test") {
        let s: S = S {
            a: 1,
        };
        let i: Int = 0;
        while (i < s.a) { // OK: No warning
            i += 1;
        }
    }
}