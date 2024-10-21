// Define custom constants
const CustomSendRemainingValue: Int = 64;
const CustomSendAllBalance: Int = 128;
const CustomSendIgnoreErrors: Int = 1;

contract SendParametersTestContract {
    // Correct usage: should not trigger any warnings
    fun correctUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: CustomSendRemainingValue
        });
    }

    // Duplicate flag usage: should trigger a warning about flags used multiple times
    fun duplicateFlagUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: CustomSendRemainingValue | CustomSendRemainingValue
        });
    }

    // Invalid operator usage: should trigger a warning about using '+' instead of '|'
    fun invalidOperatorUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: CustomSendRemainingValue + CustomSendAllBalance
        });
    }

    // Integer literal usage: should trigger a warning about using integer literals
    fun integerLiteralUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: 64 // Integer literal instead of symbolic constant
        });
    }

    // Correct combination usage: should not trigger any warnings
    fun correctCombinationUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: CustomSendRemainingValue | CustomSendAllBalance | CustomSendIgnoreErrors
        });
    }

    // Multiple issues: should trigger multiple warnings
    fun multipleIssues() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: CustomSendRemainingValue + CustomSendRemainingValue + 64 // Duplicate flags, '+' operator, integer literal
        });
    }

    // Complex expression with nested invalid operators
    fun complexInvalidOperator() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: (CustomSendRemainingValue * CustomSendAllBalance) - CustomSendIgnoreErrors
        });
    }

    // Define functionReturningLiteral within the contract scope
    fun functionReturningLiteral(): Int {
        return 64;
    }

    // Using a function call that returns an integer literal: should trigger a warning
    fun functionCallWithLiteral() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: self.functionReturningLiteral() // Uses integer literal instead of symbolic constant
        });
    }

// Using undefined symbolic constants: should trigger a warning if the constant is not recognized
 fun undefinedSymbolicConstant() {
    send(SendParameters{
        to: sender(),
        value: 0,
        mode: CustomSendIgnoreErrors | CustomSendAllBalance
    });
}

    // Correct usage with variables
    fun correctUsageWithVariables() {
        let modeFlag: Int = CustomSendRemainingValue | CustomSendIgnoreErrors;
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: modeFlag
        });
    }

    // Invalid usage with variables containing integer literals
    fun invalidUsageWithVariableLiteral() {
        let modeFlag: Int = 64;
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: modeFlag // modeFlag contains an integer literal
        });
    }
}
