"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetMeetSemilattice = exports.SetJoinSemilattice = void 0;
/**
 * Implementation of a join semilattice for sets, providing methods to establish a partial order relation.
 * @template T The type of elements in the sets.
 */
class SetJoinSemilattice {
    join(a, b) {
        return new Set([...a, ...b]);
    }
    bottom() {
        return new Set();
    }
    leq(a, b) {
        return [...a].every((x) => b.has(x));
    }
}
exports.SetJoinSemilattice = SetJoinSemilattice;
/**
 * Implementation of a meet semilattice for sets, providing methods to establish a partial order relation.
 * @template T The type of elements in the sets.
 */
class SetMeetSemilattice {
    meet(a, b) {
        return Array.from(a).reduce((acc, elem) => {
            if (b.has(elem)) {
                acc.add(elem);
            }
            return acc;
        }, new Set());
    }
    bottom() {
        return new Set();
    }
    leq(a, b) {
        return [...a].every((x) => b.has(x));
    }
}
exports.SetMeetSemilattice = SetMeetSemilattice;
