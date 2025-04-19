# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.1] - 2025-04-19

### Added
- Tact 1.6.6+ support: PR [#368](https://github.com/nowarp/misti/pull/368)
- `Driver`: Save detectors execution time in debug log

### Changed
- `PreferredStdlibApi`: More accurate severity levels and warning descriptions
- `PreferredStdlibApi` is enabled by default; `PreferAugmentedAssign` is disabled
- Prevent multiple `Tool`s with plain output format: Issue [#363](https://github.com/nowarp/misti/issues/363)
- Forbid executing `Dump{Cfg,CallGraph,Imports}` without input file: Issue [#363](https://github.com/nowarp/misti/issues/363)
- `package.json`: Update Misti version on every `yarn build`
- Don't show Tact logs in JSON output when parsing a project: Issue [#369](https://github.com/nowarp/misti/issues/369)

### Fixed
- Severity filter for detectors (optimization): Issue [#358](https://github.com/nowarp/misti/issues/358)
- Relative paths in displayed warnings: PR [#361](https://github.com/nowarp/misti/pull/361)
- `SuboptimalSend`: Incorrect `message`->`cashback` suggestion: Issue [#366](https://github.com/nowarp/misti/issues/366)
- `Logger`: Show context in JSON output: Issue [#370](https://github.com/nowarp/misti/issues/370)
- `Logger`: Race condition for context in asynchronous execution
- Unused `ResultError` and exit code `2` is never set: Issue [#371](https://github.com/nowarp/misti/issues/371)
- Colorize output in console (regression error)
- Warning category is not present in JSON output: Issue [#372](https://github.com/nowarp/misti/issues/372)

## [0.8.0] - 2025-04-08

### Added
- Tact 1.6.2+ support: PR [#328](https://github.com/nowarp/misti/pull/328)
- `SuboptimalSend` detector: PR [#330](https://github.com/nowarp/misti/pull/330) and PR [#332](https://github.com/nowarp/misti/pull/332)
- `PreferBinaryReceiver` detector: Issue [#335](https://github.com/nowarp/misti/issues/335)
- `PreferSenderFunction` detector: Issue [#336](https://github.com/nowarp/misti/issues/336)
- `ImplicitOpcode` detector: Issue [#338](https://github.com/nowarp/misti/issues/338)
- `SuboptimalCellOperation` detector: Issue [#339](https://github.com/nowarp/misti/issues/339)
- Detectors categorization (Optimization, Security, Best Practices): PR [#349](https://github.com/nowarp/misti/pull/349)
- Add quickfix suggestions for LSP inlay hints: PR [#353](https://github.com/nowarp/misti/pull/353)
- Support standalone Tools to run without `CompilationUnit`: PR [#326](https://github.com/nowarp/misti/pull/326)
- Logger: Detector contexts: PR [#327](https://github.com/nowarp/misti/pull/327)
- Logger: Print timestamps when `--verbose` is set: Issue [#73](https://github.com/nowarp/misti/issues/73)
- `PreferredStdlibApi`: Suggest using `throwUnless` over `require`: Issue [#345](https://github.com/nowarp/misti/issues/345)
- JSON Schema for Misti output: PR [#355](https://github.com/nowarp/misti/pull/355)

### Changed
- Replace imports from `@tact-lang/compiler/dist/...` to `@tact-lang/compiler`: PR [#328](https://github.com/nowarp/misti/pull/328)
- Removed `--new-detector` option and the `createDetector` module as unused
- `ExitCodeUsage`: Allow using `0` as success exit code: Issue [#344](https://github.com/nowarp/misti/issues/344)
- Use relative paths in warnings in JSON: : PR [#353](https://github.com/nowarp/misti/pull/353)
- Breaking changes: New `Warning` and `Result` structures: PR [#355](https://github.com/nowarp/misti/pull/355)

### Fixed
- `postinstall` error when using the Misti dependency with a package manager different from `yarn`: Issue [#337](https://github.com/nowarp/misti/issues/337)
- `ExitCodeUsage`: Incorrect string in the description: Issue [#341](https://github.com/nowarp/misti/issues/341)
- Fixed and improved browser support: PR [#351](https://github.com/nowarp/misti/pull/351)

## [0.7.1] - 2025-03-05

### Fixed
- Support new syntax introduced in Tact 1.6: PR [#325](https://github.com/nowarp/misti/pull/325)

## [0.7.0] - 2025-03-05

### Added
- Tact 1.6.1 support
- Tact 1.6 support: PR [#314](https://github.com/nowarp/misti/pull/314)
- `StateMutationInGetter` detector: PR [#306](https://github.com/nowarp/misti/pull/306)
- `UnprotectedCall` detector: PR [#235](https://github.com/nowarp/misti/pull/235)
- `SuspiciousLoop` detector: PR [#206](https://github.com/nowarp/misti/pull/206)
- Display function signatures with contract name on CallGraph dump: PR [#305](https://github.com/nowarp/misti/pull/305)
- Support Node version 23: PR [#301](https://github.com/nowarp/misti/pull/301)
- Support absolute paths in warning suppressions: PR [#257](https://github.com/nowarp/misti/pull/257)
- File-scoped CFG dumps: Issue [#241](https://github.com/nowarp/misti/issues/241)
- CLI option to disable Soufflé: Issue [#260](https://github.com/nowarp/misti/issues/260)
- Save logs to JSON output: PR [#275](https://github.com/nowarp/misti/pull/275)
- Callgraph: Add `asm` functions: PR [#277](https://github.com/nowarp/misti/pull/277)
- Callgraph: Save field names used in `Effect.State{Read,Write}`: PR [#280](https://github.com/nowarp/misti/pull/280)
- Callgraph: Highlight stdlib calls in dump: PR [#286](https://github.com/nowarp/misti/pull/286)
- IR: Traits support: PR [#292](https://github.com/nowarp/misti/pull/292)
- Detector: Support multiple severities: Issue [#293](https://github.com/nowarp/misti/issues/293)
- Callgraph: Traits support: Issue [#300](https://github.com/nowarp/misti/issues/300)

### Changed
- Display `warn` logger messages to `stderr` instead of `stdout`: Issue [#259](https://github.com/nowarp/misti/issues/259)
- Export Callgraph definitions for `Node` and `Edge`
- Callgraph: Hide unused stdlib functions from dump: PR [#276](https://github.com/nowarp/misti/pull/276)
- NeverAccessedVariables: More informative warning message for unused fields: Issue [#274](https://github.com/nowarp/misti/issues/274)
- Callgraph: Separate build logic to `src/internals/ir/builders/callgraph.ts`: PR [#287](https://github.com/nowarp/misti/pull/287)
- SuspiciousMessageMode: Revisited warning messages and severities: Issue [#294](https://github.com/nowarp/misti/issues/294)
- Driver+Detector: Optimize warning suppressions based on severity: PR [#303](https://github.com/nowarp/misti/pull/303)
- Consolidated all Tact imports in single file: PR [#314](https://github.com/nowarp/misti/pull/314)
- Removed Tact parser hack from `ImportGraphBuilder`: PR [#314](https://github.com/nowarp/misti/pull/314)

### Fixed
- Souffle installation in CI: PR [#253](https://github.com/nowarp/misti/pull/253)
- Tact stdlib path resolution: PR [#256](https://github.com/nowarp/misti/pull/256)
- `BranchDuplicate`: False negative in `else-if` clauses: Issue [#258](https://github.com/nowarp/misti/issues/258)
- `UnboundMap`: False positive: Issue [#262](https://github.com/nowarp/misti/issues/262)
- Internal Errors Printed to `stderr` Instead of JSON Output: Issue [#263](https://github.com/nowarp/misti/issues/263)
- `CellBounds`: Infinite recursion: PR [#272](https://github.com/nowarp/misti/pull/272)
- Callgraph: Incorrect processing of `Effect.StateWrite` for cells: PR [#279](https://github.com/nowarp/misti/pull/279)
- Callgraph: Incorrect handling of getter methods: PR [#282](https://github.com/nowarp/misti/pull/282)
- `ArgCopyMutation`: Incorrect handling of `return` in traits: Issue [#290](https://github.com/nowarp/misti/issues/290)
- `SendInLoop`: Remove redundant error logs when accessing patterns like `self.<map_field>.set()`
- `CellBounds`: Accessing property of `Object.prototype` on `.toString` method in Tact: PR [#318](https://github.com/nowarp/misti/pull/318)
- Don't print error messages when `-o "json"` is set: PR [#320](https://github.com/nowarp/misti/pull/320)
- Callgraph: Crash on `extends` function with `self` argument: Issue [#309](https://github.com/nowarp/misti/issues/309)

## [0.6.2] - 2024-12-25

### Fixed
- Callgraph: Don't add state write effects when changing local maps/strings/cells
- Regression in the single-contract mode execution: Issue [#233](https://github.com/nowarp/misti/issues/233)

## [0.6.1] - 2024-12-22

### Fixed
- The `scripts` directory wasn't included in the npm release, which makes it impossible to build Misti as a dependency

## [0.6.0] - 2024-12-22

### Added
- `CellBounds` detector: PR [#214](https://github.com/nowarp/misti/pull/214)
- `ExitCodeUsage` detector: PR [#207](https://github.com/nowarp/misti/pull/207)
- `EtaLikeSimplifications` detector: PR [#198](https://github.com/nowarp/misti/pull/198)
- `ShortCircuitCondition` detector: PR [#202](https://github.com/nowarp/misti/pull/202)
- `PreferredStdlibApi` detector now suggest some preferred replacements for cell methods
- Add Callgraph: PR [#185](https://github.com/nowarp/misti/pull/185)
- Support for browser environment: PR [#231](https://github.com/nowarp/misti/pull/231)
- `souffleEnabled` option to disable Souffle check execution: PR [#231](https://github.com/nowarp/misti/pull/231)
- Add function effects to Callgraph: PR [#227](https://github.com/nowarp/misti/pull/227)

### Changed
- `SuspiciousMessageMode` detector now suggests using SendDefaultMode instead of 0 for mode: PR [#199](https://github.com/nowarp/misti/pull/199/)
- `CellOverflow` detector was replaced with the `CellBounds` detector that supports both overflows and underflows: PR [#214](https://github.com/nowarp/misti/pull/214)
- Renamed IR entries to follow the Tact codebase naming style

### Fixed
- Missing Module `version-info` When Installing Misti from GitHub: Issue [#216](https://github.com/nowarp/misti/issues/216/)
- `ExitCodeUsage` Handle direct cases: Issue [#218](https://github.com/nowarp/misti/issues/218/)

## [0.5.0] - 2024-10-31

### Added
- `SuspiciousMessageMode` detector: PR [#193](https://github.com/nowarp/misti/pull/193)
- `SendInLoop` detector: PR [#168](https://github.com/nowarp/misti/pull/168)
- `CellOverflow` detector: PR [#177](https://github.com/nowarp/misti/pull/177)
- `UnboundMap` detector: Issue [#50](https://github.com/nowarp/misti/issues/50)
- `UnusedExpressionResult` detector: PR [#190](https://github.com/nowarp/misti/pull/190)
- Warning suppressions: PR [#203](https://github.com/nowarp/misti/pull/203)
- `--list-detectors` CLI option: PR [#192](https://github.com/nowarp/misti/pull/192)
- Import Graph: PR [#180](https://github.com/nowarp/misti/pull/180)
- Leverage `ImportGraph` to resolve entry points: PR [#194](https://github.com/nowarp/misti/pull/194)
- Accept directory as input: PR [#195](https://github.com/nowarp/misti/pull/195)
- Timeout on executing detectors: Issue [#47](https://github.com/nowarp/misti/issues/47)

### Changed
- Improved and optimized the test suite: PR [#184](https://github.com/nowarp/misti/pull/184)
- Introduced the branded type pattern to improve type safety: Issue [#191](https://github.com/nowarp/misti/issues/191)

## [0.4.2] - 2024-10-12

### Fixed
- Return a successful exit code when Misti analysis does not generate any warnings

## [0.4.1] - 2024-10-12

### Changed
- Make the filepath argument optional: Issue [#170](https://github.com/nowarp/misti/issues/170)

### Fixed
- Return a non-zero exit code when warnings are raised or an execution error occurs

## [0.4.0] - 2024-10-08

### Added
- `OptimalMathFunction` detector: Issue [#146](https://github.com/nowarp/misti/issues/146)
- `DuplicatedCondition` detector: Issue [#147](https://github.com/nowarp/misti/issues/147)
- `UnusedOptional` detector: Issue [#86](https://github.com/nowarp/misti/issues/86)
- `EnsurePrgSeed` detector: Issue [#151](https://github.com/nowarp/misti/issues/151)
- `FalseCondition` detector: Issue [#93](https://github.com/nowarp/misti/issues/93)
- Introduces Misti tools – additional modules that can be used alongside detectors to cover various user tasks beyond warning generation: PR [#154](https://github.com/nowarp/misti/pull/154)
- Support warnings suppression: Issue [#152](https://github.com/nowarp/misti/issues/152)
- CFG Dump: Mermaid output: Issue [#141](https://github.com/nowarp/misti/issues/141)
- Misti execution result in the JSON format using `--output json`/`-o json`: Issue [#123](https://github.com/nowarp/misti/issues/123)
- ANSI escape sequences to colorize output and the `--no-colors` CLI option to disable it
- Driver in a single-contract mode tries to copy all the .tact and .fc files to resolve imports
- Short CLI options. See: https://nowarp.io/tools/misti/docs/next/tutorial/cli
- CLI: `--min-severity/-m` option to filter warnings
- More informative error messages when an incorrect Misti or Tact configuration file is set

### Changed
- Include Git revision number to non-release version numbers
- Warnings now have more comprehensive descriptions and are sorted by severity
- `DumpIsUsed`: Report only `dump` calls with non-literal arguments
- Misti API to execute the driver programmatically
- `ArgCopyMutation`: Report once per function: Issue [#150](https://github.com/nowarp/misti/issues/150)
- `ArgCopyMutation`: Don't report arguments returned from the function: Issue [#149](https://github.com/nowarp/misti/issues/149)
- Rename CLI options: `--suppress` -> `--disable-detectors`; `--detectors` -> `--enable-detectors`

### Fixed
- `ReadOnlyVariables`: Don't suggest creating constants from variables resulted from fields and method calls: Issue [#148](https://github.com/nowarp/misti/issues/148)

## [0.3.1] - 2024-09-24

### Fixed
- `NeverAccessedVariables`: False positive: reported a map variable used in the `foreach` loop
- Path to the compiled `main.js` in `./bin/misti`

## [0.3.0] - 2024-09-22

### Added
- `StringReceiversOverlap` detector: PR [#122](https://github.com/nowarp/misti/pull/122)
- `AsmIsUsed` detector: Issue [#119](https://github.com/nowarp/misti/issues/119)
- `PreferredStdlibApi` detector: Issue [#132](https://github.com/nowarp/misti/issues/132)
- `InheritedStateMutation` detector: Issue [#64](https://github.com/nowarp/misti/issues/64)
- `ArgCopyMutation` detector: Issue [#125](https://github.com/nowarp/misti/issues/125)
- Allow running Misti without Souffle installation: Issue [#45](https://github.com/nowarp/misti/issues/45)
- Add `index.ts` in order to simplify writing custom detectors: PR [#140](https://github.com/nowarp/misti/pull/140)
- `--dump-ast` CLI option.
- `--suppress` CLI option: Issue [#135](https://github.com/nowarp/misti/issues/135)
- `--souffle-binary` CLI option to specify path to the Souffle executable
- `--souffle-verbose` CLI option to include comments to the generated Souffle files: PR [#120](https://github.com/nowarp/misti/pull/120)
- Benchmarks for executing detectors. Use e.g. `yarn benchmark ./test/good/sample-jetton.tact`.
- Public API to handle Tact stdlib paths
- Detector templates and the `--new-detector` CLI option: PR [#105](https://github.com/nowarp/misti/pull/105)
- A script to generate detectors documentation: `./scripts/generateDetectorDocs.ts`
- The `--detectors` CLI option can be used to quickly run Misti with the specified detectors, e.g., `yarn misti --detectors ReadOnlyVariables,./examples/implicit-init/implicitInit.ts:ImplicitInit`
- `TactASTUtil`: API functions to check mutability of the statement.
- Asynchronous detectors and Souffle execution: PR [#118](https://github.com/nowarp/misti/pull/118)
- Supported Tact 1.5: Issue [#33](https://github.com/nowarp/misti/issues/33)

### Changed
- Moved Souffle bindings to a its own repository https://github.com/nowarp/souffle.js: PR [#120](https://github.com/nowarp/misti/pull/120)
- Refined the CLI interface.
- The `engines` property in `package.json` and its strict checking to ensure minimal required Node.js version is 22 (follows-up changes in Tact).

### Fixed
- Adjust option names in Config and JSONSchema
- Paths to custom detectors: Fix support for absolute paths and allow developers to specify the `.ts` extension to ensure it works exactly as described in the documentation: https://nowarp.github.io/tools/misti/docs/next/hacking/custom-detector/
- Don't show nowarp.io documentation links for custom detectors: Issue [#128](https://github.com/nowarp/misti/issues/128)

## [0.2.2] - 2024-08-22

### Added

### Changed

### Fixed
- `release-it` command to update package on npm

## [0.2.1] - 2024-08-22

### Added

### Changed
- Improve internal Misti driver API used in tests and `blueprint-misti`

### Fixed

## [0.2.0] - 2024-08-21

### Added
- `ConstantAddress` detector: PR [#90](https://github.com/nowarp/misti/pull/90)
- `BranchDuplicate` detector: Issue [#87](https://github.com/nowarp/misti/issues/87)
- `DumpIsUsed` detector: Issue [#100](https://github.com/nowarp/misti/issues/100)
- `FieldDoubleInit` detector: Issue [#97](https://github.com/nowarp/misti/issues/97)
- `PreferAugmentedAssign` detector: Issue [#78](https://github.com/nowarp/misti/issues/78)
- An API to execute Misti from a string list of arguments
- `--dump-config` CLI flag that dumps the Misti configuration file in use: PR [#79](https://github.com/nowarp/misti/pull/79)
- Naming convention to skip unused identifiers: PR [#82](https://github.com/nowarp/misti/pull/82)
- `--all-detectors` CLI flag activates all the available built-in detectors, regardless of whether they are selected in the config

### Changed
- IRBuilder: Mark nodes without successors as `Exit` kind: PR [#80](https://github.com/nowarp/misti/pull/80)
- Supported Tact 1.4.4

### Fixed
- IRBuilder: Save trait definitions: PR [#95](https://github.com/nowarp/misti/pull/95)
- `neverAccessedVariables` does not report write-only variables: Issue [#101](https://github.com/nowarp/misti/pull/95)

## [0.1.2] - 2024-08-06

### Added

### Changed

### Fixed
- Set the actual documentation URL in warnings.

## [0.1.1] - 2024-08-06

### Added

### Changed

### Fixed
- The npm postinstall script tries to build a contract project after running `yarn add @nowarp/misti`.

## [0.1.0] - 2024-08-06
### Added
- Initial release
