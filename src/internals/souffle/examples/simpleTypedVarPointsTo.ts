//
// Implements https://souffle-lang.github.io/examples#simple-typed-symbolpointsto in Souffle.js
//

import {
  SouffleContext,
  SouffleSyncExecutor,
  relation,
  rule,
  atom,
  body,
} from "..";

// Initialize the Souffle context that keeps the created program entries.
const ctx = new SouffleContext("VarPointsTo");

// Add relation declarations:
// .decl assign( a:symbol , b:symbol )
// .decl new( v:symbol, o:symbol )
// .decl ld( a:symbol, b:symbol, f:symbol  )
// .decl st( a:symbol, f:symbol, b:symbol )
ctx.add(
  relation("assign", [
    ["a", "Symbol"],
    ["b", "Symbol"],
  ]),
);
ctx.add(
  relation("new", [
    ["v", "Symbol"],
    ["o", "Symbol"],
  ]),
);
ctx.add(
  relation("ld", [
    ["a", "Symbol"],
    ["b", "Symbol"],
    ["f", "Symbol"],
  ]),
);
ctx.add(
  relation("st", [
    ["a", "Symbol"],
    ["f", "Symbol"],
    ["b", "Symbol"],
  ]),
);

// Add facts:
// assign("v1","v2").
// new("v1","h1").
// new("v2","h2").
// new("v3","h3").
// st("v1","f","v3").
// ld("v4","v1","f").
ctx.addFact("assign", ["v1", "v2"]);
ctx.addFact("new", ["v1", "h1"]);
ctx.addFact("new", ["v2", "h2"]);
ctx.addFact("new", ["v3", "h3"]);
ctx.addFact("st", ["v1", "f", "v3"]);
ctx.addFact("ld", ["v4", "v1", "f"]);

// Add rules:
// .decl alias( a:symbol, b:symbol )
// .output alias
// alias(X,X) :- assign(X,_).
// alias(X,X) :- assign(_,X).
// alias(X,Y) :- assign(X,Y).
// alias(X,Y) :- ld(X,A,F), alias(A,B), st(B,F,Y).
ctx.add(
  relation(
    "alias",
    [
      ["a", "Symbol"],
      ["b", "Symbol"],
    ],
    "output",
  ),
);
ctx.add(rule([atom("alias", ["X", "X"])], [body(atom("assign", ["X", "_"]))]));
ctx.add(rule([atom("alias", ["X", "X"])], [body(atom("assign", ["_", "X"]))]));
ctx.add(rule([atom("alias", ["X", "Y"])], [body(atom("assign", ["X", "Y"]))]));
ctx.add(
  rule(
    [atom("alias", ["X", "Y"])],
    [
      body(atom("ld", ["X", "A", "F"])),
      body(atom("alias", ["A", "B"])),
      body(atom("st", ["B", "F", "Y"])),
    ],
  ),
);

// .decl pointsTo( a:symbol, o:symbol )
// .output pointsTo
// pointsTo(X,Y) :- new(X,Y).
// pointsTo(X,Y) :- alias(X,Z), pointsTo(Z,Y).
ctx.add(
  relation(
    "pointsTo",
    [
      ["a", "Symbol"],
      ["o", "Symbol"],
    ],
    "output",
  ),
);
ctx.add(rule([atom("pointsTo", ["X", "Y"])], [body(atom("new", ["X", "Y"]))]));
ctx.add(
  rule(
    [atom("pointsTo", ["X", "Y"])],
    [body(atom("alias", ["X", "Z"])), body(atom("pointsTo", ["Z", "Y"]))],
  ),
);

// Execute the generated Soufflé program containing all the added entries
const executor = new SouffleSyncExecutor();
const out = executor.execute(ctx);
if (out.kind !== "raw") {
  throw new Error(
    `Error executing Soufflé:\n${out.kind === "error" ? out.stderr : "impossible"}`,
  );
}
console.log("Raw Soufflé output:\n", out.results);
