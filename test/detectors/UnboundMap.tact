contract C {
    m_bad: map<Int, Int> = emptyMap(); // Bad
    m_ok: map<Int, Int> = emptyMap(); // OK

    // OK: Don't report it since we put nothing in this map
    m_unused: map<Int, Int> = emptyMap();
    m_receiver: map<Int, Int> = null;

    fun test() {
        self.m_ok.set(1, 1);
        self.m_ok.del(1);

        self.m_bad.set(1, 1);
    }

    receive() {
        self.m_receiver.set(1, 1);
        self.m_receiver.del(1);
    }
}
