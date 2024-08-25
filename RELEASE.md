# Misti release checklist template

- [ ] Release new Misti version
  - [ ] Run: `yarn release -- --dry-run` to ensure everything works as expected
  - [ ] Run: `yarn release --` and follow the instructions
- [ ] Create a GitHub release
- [ ] Prepare [documentation](https://github.com/nowarp/nowarp.github.io/):
  - [ ] Update the supported Tact version in the introduction page
  - [ ] Check whether `configuration.md` is updated according to `configSchema.json`
  - [ ] Check if examples are updated according to API changes
  - [ ] Ensure that funding information is actual
  - [ ] Run: `yarn spell && yarn build` from the `nowarp.github.io` directory to ensure there are no errors
  - [ ] Release a new version of documentation: `npx docusaurus docs:version <VERSION>`
  - [ ] Run: `yarn build && yarn deploy` from the `nowarp.github.io` directory
- [ ] Add the `Unreleased` section in [CHANGELOG.md](./CHANGELOG.md):
```
## [Unreleased]

### Added

### Changed

### Fixed
```
- [ ] Create a post that highlights introduced changes
