fun test(): Int {
  let sum: Int = 0;
  let i: Int = 0;
  do {
    i = i + 1;
    sum = sum + i;
  } until (i < 10);
  return sum;
}
