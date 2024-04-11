import "@stdlib/deploy";

fun test(): String {
    return "test";
}

contract Simple with Deployable {
    init() {
    }
    get fun result(): String {
        return test();
    }
}
