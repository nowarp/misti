asm(-> 1 0) extends mutates fun loadRefEx(self: Slice): Cell { LDREF }

// OK: Suppressed
// @misti:suppress AsmIsUsed
asm(-> 1 0) extends mutates fun loadRefExSuppressed(self: Slice): Cell { LDREF }
