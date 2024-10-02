## Adding backtraces to the logger
To add debug traces to all log messages, set the `MISTI_TRACE` environment variable to `1`.

## Updating expected outputs of tests
Set the environment variable: `BLESS=1 yarn test`.
You could also run a single test or update its expected output when working with `tactIR.spec.ts` or `builtinDetectors.spec.ts`: `BLESS=1 yarn test test/tactIR.spec.ts tests/good/never-accessed.tact`.