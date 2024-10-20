contract C {
    m_bad: map<Int, Int> = emptyMap();
    m_ok: map<Int, Int> = emptyMap();
    // OK: Don't report it since we put nothing in this map
    m_unused: map<Int, Int> = emptyMap();

    fun test() {
        self.m_ok.set(1, 1);
        self.m_ok.del(1);

        self.m_bad.set(1, 1);
    }
}
