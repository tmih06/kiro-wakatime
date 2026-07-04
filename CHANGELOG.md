# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0]

### Added
- Kiro file writes are now attributed as AI-authored code: heartbeats use the
  `ai coding` category and send per-write AI line counts via
  `--ai-line-changes`, so the WakaTime dashboard can split human vs AI code.
- Capability detection for wakatime-cli: `ai coding` and AI line attribution
  are only sent when the resolved CLI supports them (wakatime-cli 2.x+).

### Changed
- On wakatime-cli 1.x, write heartbeats automatically fall back to the `coding`
  category, preserving compatibility with older CLIs.

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
