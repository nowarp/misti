// Bad example - using reserved exit code 128, which should trigger the detector warning
contract BadExitCodeContract {
    const InvalidExitCode: Int = 128;
    owner: Address;

    init(ownerAddress: Address) {
        self.owner = ownerAddress;
    }

    receive("Bad Example!") {
        nativeThrowUnless(self.InvalidExitCode, sender() == self.owner);
    }
}

// Another bad example - using an exit code above the allowed range, which should also trigger a warning
contract ExcessiveExitCodeContract {
    const ExcessiveExitCode: Int = 70000;
    owner: Address;

    init(ownerAddress: Address) {
        self.owner = ownerAddress;
    }

    receive("Bad Example!") {
        nativeThrowUnless(self.ExcessiveExitCode, sender() == self.owner);
    }
}

// Good example - using a valid developer-defined exit code within the allowed range
contract ValidExitCodeContract {
    const ValidExitCode: Int = 256;
    owner: Address;

    init(ownerAddress: Address) {
        self.owner = ownerAddress;
    }

    receive("Good example") {
        nativeThrowUnless(self.ValidExitCode, sender() == self.owner);
    }
}

// Another good example - an exit code within the range, near the upper limit
contract UpperLimitExitCodeContract {
    const NearMaxExitCode: Int = 65535;
    owner: Address;

    init(ownerAddress: Address) {
        self.owner = ownerAddress;
    }

    receive("upperLimitFunc") {
        nativeThrowUnless(self.NearMaxExitCode, sender() == self.owner);
    }
}