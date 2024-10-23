contract SendParametersTestContract {
    // Correct usage: should not trigger any warnings
    fun correctUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue | SendPayGasSeparately //OK
        });
    }

    // Duplicate flag usage: should trigger a warning about flags used multiple times
    fun duplicateFlagUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue | SendRemainingValue //BAD
        });
    }

    // Invalid operator usage: should trigger a warning about using '+' instead of '|'
    fun invalidOperatorUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors //BAD
        });
    }

    // Integer literal usage: should trigger a warning about using integer literals
    fun integerLiteralUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: 64 //BAD. Integer literal instead of symbolic constant 
        });
    }

    // Correct combination usage: should not trigger any warnings
    fun correctCombinationUsage() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingBalance | SendDestroyIfZero | SendIgnoreErrors //OK
        });
    }

    // Multiple issues: should trigger multiple warnings
    fun multipleIssues() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: SendRemainingValue + SendRemainingValue + 64 //BAD. Duplicate flags, '+' operator, integer literal 
        });
    }

    // Complex expression with nested invalid operators and unary operation
    fun complexInvalidOperator() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: -(SendRemainingValue * SendPayGasSeparately) - SendIgnoreErrors //BAD
        });
    }

    // Using a function call that returns an integer literal: should trigger a warning
    fun functionReturningLiteral(): Int {
        return 64; //OK
    }

    fun functionCallWithLiteral() {
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: self.functionReturningLiteral() //BAD. Uses integer literal instead of symbolic constant
        });
    }

    // Correct usage with variables
    fun correctUsageWithVariables() {
        let modeFlag: Int = SendRemainingValue | SendIgnoreErrors;
        send(SendParameters{
            to: sender(),
            value: 0,
            mode: modeFlag //OK
        });
    }
}
