# Changelog

## [0.6.1]

### Bug Fixes
- **Fixed Branch Selection Dropdown**: Resolved issue where branch switching would fail with "fatal: ambiguous argument 'undefined'" error
- **Improved Message Handling**: Fixed destructuring of branch selection messages in webview communication

## [0.6.0]

### New Features
- **Working Changes Mode**: Added ability to review uncommitted changes against HEAD alongside existing branch compare mode
- **Smart Mode Selection**: Automatically defaults to optimal review mode based on uncommitted changes
- **Intelligent Warnings**: Contextual warnings when using suboptimal review modes with actionable guidance
- **Empty State Messages**: Helpful guidance when no changes are available to review
- **Enhanced User Experience**: Persistent header warnings and improved mode switching feedback

## [0.5.0]

### Advanced Comment Storage System
- **Context-Based Anchoring**: Comments now track surrounding code context for intelligent repositioning
- **Smart Line Tracking**: Automatically repositions comments when code is moved or modified
- **Robust Validation**: Comments validate against actual file content with multi-status tracking
- **Legacy Migration**: Seamlessly upgrades old comment formats to new system
- **Force Push Handling**: Comments persist correctly through history rewrites when content unchanged

### Enhanced Comment Workflow
- **Streamlined Submission**: Auto-clears submitted comments without user prompts
- **WYSIWYG Principle**: What you see in UI is exactly what gets submitted
- **Advanced Filtering**: Comments scope correctly to current diff context
- **Performance Optimized**: Efficient handling of large files and unicode content

### User Interface
- **Line Selection Improvements**: Better line selection

### Developer Experience
- **Comprehensive Test Suite**: 600+ lines of automated tests covering edge cases
- **Debug Tools**: Detailed validation information for troubleshooting
- **Error Resilience**: Graceful handling of malformed data and boundary conditions

## [0.4.0]

### Major Features
- **Search**: Real-time search across all diffs with keyboard navigation (`Ctrl+F`/`Cmd+F`)
- **Clickable File Paths**: Click filenames to open files directly in VS Code
- **Copy File Names**: Copy file paths to clipboard with visual feedback

### Architecture Improvements
- **Modular CSS Architecture with Stimulus**: Complete rewrite with organized, maintainable JavaScript controllers and split styles into logical components

### User Experience
- **Visual Feedback**: Loading states, button state management, and better error handling
- **Refresh Improvements**: Loading screen during refresh with status updates
- **Quality of Life**: Disabled buttons when no comments exist, improved visual states

## [0.3.0]

### 🚀 AI Integration
- **One-click Review Submission**: Direct integration with Cursor AI chat
- **Improved Workflow**: Simplified review process with smart fallbacks

## [0.2.0]

### 🔧 Stability Improvements
- **Better Branch Persistence**: Maintains branch selection across refreshes
- **Layout Optimizations**: Full-width diff view and improved responsive design

## [0.1.0]

### 🎉 Initial Release
- **Core Review Workflow**: GitHub-style pull request review for local development
- **Interactive Diff View**: Split-view diff with syntax highlighting
- **Comment System**: Line-specific review feedback with persistence
