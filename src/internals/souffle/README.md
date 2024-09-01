# Souffle.js

Souffle.js offers bindings to [Soufflé](https://souffle-lang.github.io/), an open-source, parallel logic programming language.

## Installation

Install the library with Yarn:

```bash
yarn add @nowarp/souffle.js
```

## Getting Started

Here is an example implementing the [Simple Typed VarPointsTo](https://souffle-lang.github.io/examples#simple-typed-varpointsto) example:

```typescript
const ctx = new SouffleContext("VarPointsTo");

// Declare relations
ctx.add(
  relation("assign", [
    ["a", "Symbol"],
    ["b", "Symbol"],
  ]),
);

// Add facts
ctx.addFact("assign", ["v1", "v2"]);

// Define and output rules
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

// Execute the Soufflé program
const executor = new SouffleSyncExecutor();
const out = executor.execute(ctx);
console.log("Raw Soufflé output:\n", out.results);
```

For the full example, see the source [here](./examples/simpleTypedVarPointsTo.ts).

## Projects Using Souffle.js

- [nowarp/misti](https://github.com/nowarp/misti) – Static analyzer for TON smart contracts
