# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
