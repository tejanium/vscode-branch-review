# Branch Review

A VS Code extension for local code review with **seamless Cursor AI integration**. Review your changes and automatically submit them to Cursor's chat with one click!

## Demo

![Branch Review Demo](img/example.gif)

## Features

### 🔍 **New in v0.4.0: Advanced Search & Navigation**
- **⌨️ Keyboard Shortcuts**: Press `Ctrl+F` (`Cmd+F` on Mac) to search within diffs
- **🎯 Smart Search**: Real-time search with debouncing and intelligent highlighting
- **📍 Match Navigation**: Navigate between search results with Enter/Shift+Enter or arrow buttons
- **📁 Clickable Files**: Click filenames to open/focus files directly in VS Code
- **📋 Copy File Names**: Copy file paths to clipboard with visual feedback
- **💬 Enhanced Commenting**: Comment on all line types including context lines (unchanged code)
- **💫 Smooth UX**: Hidden search interface that appears on demand

### ✨ **Seamless Cursor Integration**
- **🚀 One-Click Submission**: Automatically opens Cursor chat and submits your review
- **🎯 Auto-Focus**: Intelligently focuses chat input for immediate interaction
- **🔄 Smart Fallbacks**: Multiple integration methods ensure reliability

### 📋 **Core Review Features**
- Compare current branch against any base branch
- Split diff view with syntax highlighting
- Add comments to specific lines or line ranges (including context lines)
- Edit and delete comments
- Persistent local storage of comments
- Configurable review template via VS Code settings

## Quick Start

1. Open a git repository with a feature branch
2. Press `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
3. Select a base branch to compare against
4. Add comments to lines in the diff view
5. Click **"🚀 Submit Review to Chat"**
6. **Watch as Cursor chat opens and your review appears automatically!** ✨

## How It Works

1. **Select Base Branch**: Choose what branch to compare against
2. **View Diff**: See side-by-side comparison of changes
3. **Add Comments**: Click on line numbers to add review comments
4. **Submit to Chat**: One-click submission directly to Cursor's AI chat for instant feedback

## Usage

### Starting a Review

- Press `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
- Or use Command Palette: "Branch Review: Start Branch Review"

### Selecting Base Branch

1. Click the dropdown in the header showing the current comparison
2. Select any available branch (main, develop, etc.)
3. Diff view updates to show changes against the selected base

### Adding Comments

**Single Line:**
1. Click line number or `+` button (available on all line types including context lines)
2. Type comment in text area
3. Click "Add comment"

**Multiple Lines:**
1. Click first line, then Shift+click last line for range
2. Or Ctrl/Cmd+click to select individual lines
3. Add comment for selected lines

**Managing Comments:**
- Edit: Click edit button on existing comments
- Delete: Click delete button to remove comments
- Multiple comments per file are supported

### File Operations

**Opening Files:**
- Click on any filename to open/focus it in VS Code editor
- Files open in preview mode with focus for immediate editing

**Copying File Paths:**
- Click the copy button next to filenames
- File path is copied to clipboard with visual confirmation

### 🔍 Searching Within Diffs

**Opening Search:**
- Press `Ctrl+F` (Windows/Linux) or `Cmd+F` (Mac)
- Search box appears in top-right corner

**Search Features:**
- **Real-time search**: Results update as you type (300ms debounce)
- **Match highlighting**: Found text is highlighted in yellow
- **Current match**: Active match has distinct highlighting
- **Match counter**: Shows "2 of 5" style position indicator

**Navigation:**
- `Enter`: Go to next match
- `Shift+Enter`: Go to previous match
- Click ↑↓ arrow buttons for navigation
- `Escape` or click ✕ to close search

**Smart Behavior:**
- Empty search automatically clears highlights
- Changed search terms trigger new search
- Smooth scrolling to current match

### Submitting Review to Cursor Chat

1. Click **"🚀 Submit Review to Chat"** button
2. **Cursor chat opens automatically**
3. **Review is pasted automatically**
4. **Start chatting with AI immediately** - no manual steps needed!
5. Comments are automatically cleared after successful submission

**Fallback:** If automatic submission fails, review is copied to clipboard as backup.

## Configuration

Configure review output format in VS Code settings:

**Settings UI:**
1. Open Settings (`Cmd+,`)
2. Search "Branch Review"
3. Configure:
   - **Branch Review › Prompt: Header** - Text at start of output
   - **Branch Review › Prompt: Footer** - Text at end of output

**Settings JSON:**
```json
{
  "branchReview.prompt.header": "# Code Review\\n\\nComments:",
  "branchReview.prompt.footer": "---\\n\\nPlease address these items."
}
```

**Workspace Settings:**
Create `.vscode/settings.json`:
```json
{
  "branchReview.prompt.header": "# Team Review",
  "branchReview.prompt.footer": "End of review."
}
```

## Output Format

Comments are formatted as markdown:

```markdown
# Code Review Feedback

I have reviewed the changes in this branch and have the following feedback:

## 1. `src/app.js`

### Issue 1 (Lines 12-15)

**Feedback:** Consider using reduce() for better performance

### Issue 2 (Lines 28)

**Feedback:** Add error handling for edge cases

## 2. `src/utils.js`

### Issue 1 (Lines 5-7)

**Feedback:** Extract this logic into a separate function

---

Please address these review comments and make the necessary changes.
```

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Branch Review: Start Branch Review** | `Cmd+Shift+R` | Open review interface |
| **Branch Review: Submit Review to Chat** | - | Automatically submit review to Cursor chat |
| **Branch Review: Clear All Comments** | - | Remove all saved comments |

## Requirements

- VS Code 1.74.0 or higher
- Git repository
- Feature branch (not main/master)
- Changes between current branch and base branch

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript and copy assets
npm run compile

# Launch Extension Development Host
# Press F5 in VS Code

# Watch for changes during development
npm run watch
```

## Known Issues

- Binary files are not displayed in diff view
- Very large files may impact performance
- Some git configurations may affect diff generation

## License

MIT License

---

*Vibe coded with Cursor* 🤖✨
