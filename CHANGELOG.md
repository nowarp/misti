# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `--dump-config` CLI flag that dumps the Misti configuration file in use: PR [#79](https://github.com/nowarp/misti/pull/79)
- Naming convention to skip unused identifiers: PR [#82](https://github.com/nowarp/misti/pull/82)
- `--all-detectors` CLI flag activates all the available built-in detectors, regardless of whether they are selected in the config
- `ConstantAddress` detector: PR [#90](https://github.com/nowarp/misti/pull/90)

### Changed
- IRBuilder: Mark nodes without successors as `Exit` kind: PR [#80](https://github.com/nowarp/misti/pull/80)
- Supported Tact 1.4.2

### Fixed

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
