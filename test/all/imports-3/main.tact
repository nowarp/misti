import "./trait.tact";

contract Test with TraitWithConstant {
    receive() {}

    get fun constant(): Int {
        return self.getConstant();
    }
}
