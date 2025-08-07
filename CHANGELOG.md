# Changelog

All notable changes to the "Branch Review" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2024-12-20

### Fixed
- Fixed dropdown state persistence - branch selection now maintains when refreshing the diff view instead of reverting to main branch
- Fixed diff view width constraints - removed max-width limitation to utilize full viewport width for better readability
- Fixed horizontal overflow issue when using full viewport width by adding proper box-sizing

### Changed
- Improved user experience by preserving branch selection across refresh operations
- Enhanced diff view layout to make better use of available screen space

## [0.1.0] - Initial Release

### Added
- GitHub-style pull request review workflow for local development
- Interactive diff view with split-view layout
- Comment system for adding review feedback
- Branch comparison functionality
- Clipboard integration for copying review summaries
- Syntax highlighting for code diffs
- Keyboard shortcuts for quick access
