import "@stdlib/deploy";

contract Simple with Deployable {
    // Provides an init function, so no errors are repored.
    // TODO(bh): Add an error here when Tact v1.3 with implicit inits is released.
    init() {}
}
