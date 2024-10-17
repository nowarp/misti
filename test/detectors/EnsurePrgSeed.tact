contract C {
    fun test(): Int {
        // Bad: Calling nativeRandom without PRG init
        return nativeRandom();
    }
}
