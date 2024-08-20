# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Supported Tact 1.4.2

### Fixed
- IRBuilder: Save trait definitions: PR [#95](https://github.com/nowarp/misti/pull/95)

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
