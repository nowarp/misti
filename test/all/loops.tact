fun test1(): Int {
  let sum: Int = 0;
  let i: Int = 0;
  while (i < 10) {
    i = i + 1;
    sum = sum + i;
  }
  return sum;
}

fun test2(): Int {
  let sum: Int = 0;
  let i: Int = 0;
  do {
    i = i + 1;
    sum = sum + i;
  } until (i < 10);
  return sum;
}

fun test3(): Int {
  let sum: Int = 0;
  let i: Int = 0;
  repeat (10) {
    i = i + 1;
    sum = sum + i;
  }
  return sum;
}

fun test4() {
    let m: map<Int, Int> = emptyMap();
    foreach (k, v in m) {
    }
}
