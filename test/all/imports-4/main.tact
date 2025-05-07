import "./constants.tact"; // Also transitively imports `constants2.tact`
import "./messages.tact";
import "./messages"; // Importing the same file
import "./test"; // Importing without extension
import "@stdlib/ownable";

fun test() {}
contract C{}
