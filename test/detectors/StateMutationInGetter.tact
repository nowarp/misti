contract StateMutationInGetter {
    value: Int = 0;
    owner: Address;
    
    init(owner: Address) {
        self.owner = owner;
    }
    
    // Bad: Getter modifies state directly
    get fun badDirectMutation(): Int {
        self.value = self.value + 1; // BAD Direct state mutation
        return self.value;
    }
    
    // Bad: Getter calls state-mutating function
    get fun badIndirectMutation(): Int {
        self.updateCounter(); // BAD
        return self.value;
    }
    
    // Ok: Pure getter
    get fun goodGetter(): Int {
        return self.value;
    }
    
    // State-mutating func
    fun updateCounter() {
        self.value = self.value + 1;
    }
    
    // Extra getter that also modifies state but is not marked with 'get'
    fun getAndIncrement(): Int {
        let current = self.value;
        self.value = self.value + 1;
        return current;
    }
    
    // Method delegates to another state-mutating method
    get fun nestedMutation(): Int {
        self.indirectUpdate(); // Calls another function that modifies state
        return self.value;
    }
    
    // Helper
    fun indirectUpdate() {
        self.updateCounter();
    }
}