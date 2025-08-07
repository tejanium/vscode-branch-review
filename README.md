# Branch Review

A VS Code extension for local code review that formats comments for easy copy-paste into Cursor and other AI tools.

## Demo

![Branch Review Demo](img/example.gif)

## Features

- Compare current branch against any base branch
- Split diff view with syntax highlighting
- Add comments to specific lines or line ranges
- Edit and delete comments
- Persistent local storage of comments
- Copy formatted review to clipboard for external tools
- Configurable review template via VS Code settings

## Quick Start

1. Open a git repository with a feature branch
2. Press `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
3. Select a base branch to compare against
4. Add comments to lines in the diff view
5. Copy formatted review to clipboard
6. Feed it into Cursor or other AI tools

## How It Works

1. **Select Base Branch**: Choose what branch to compare against
2. **View Diff**: See side-by-side comparison of changes
3. **Add Comments**: Click on line numbers to add review comments
4. **Copy Review**: Generate formatted text and copy to clipboard for use in external tools

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
1. Click line number or `+` button
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

### Copying Review

1. Click the copy button to format all comments
2. Formatted review is copied to clipboard
3. Comments are automatically cleared after copying

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
| **Branch Review: Submit Review Comments to Cursor** | - | Copy formatted review to clipboard |
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
