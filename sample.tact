contract A {
    m: map<Int, Int> = null;
    get fun m(): map<Int, Int> {
        return self.m;
    }
    receive() {
        while (true) {
            self.m.set(1, 2);
        }
    }
}
