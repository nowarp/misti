import "./constants.tact";

trait TraitWithConstant {
    fun getConstant(): Int {
        return SOMETHING;
    }
}
