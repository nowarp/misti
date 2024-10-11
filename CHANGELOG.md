# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Make filepath argument optional: Issue [#170](https://github.com/nowarp/misti/issues/170)

### Fixed
- Return a non-zero exit code when warnings are raised or an execution error occurs.

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
