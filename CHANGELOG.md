# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2]

### Added
- Publish workflow now attaches the packed `.tgz` tarball and the matching
  changelog section to an automatically created GitHub Release.

## [1.0.1]

### Fixed
- Heartbeats now use the valid WakaTime category `coding` instead of the
  invalid `ai coding`, which `wakatime-cli` rejected — previously all
  file-write and prompt/stop heartbeats failed silently.

### Changed
- Switched npm publishing to OIDC Trusted Publishing, removing the need for a
  stored `NPM_TOKEN`. Provenance is generated automatically.

### Added
- Continuous integration: lint, unit tests, and end-to-end CLI tests across a
  Node.js version matrix, plus a package-build check.

## [1.0.0]

### Added
- Initial release: WakaTime time tracking for Kiro CLI via agent hooks.
- `heartbeat`, `setup`, `api-key`, `install-cli`, and `status` commands.
