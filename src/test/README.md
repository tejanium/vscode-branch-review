# CommentStorage Test Suite

This directory contains comprehensive tests for the advanced comment storage system.

## Test Files

### `commentStorage.test.ts`
Full test suite using Mocha framework covering:
- **Basic Operations**: CRUD operations, storage persistence
- **Anchor Creation**: Context-based anchoring with line tracking
- **Validation & Repositioning**: Smart line tracking across file changes
- **Edge Cases**: Force push, whitespace changes, line ending differences
- **Legacy Migration**: Backwards compatibility with old comment formats
- **Performance**: Large file handling, unicode content

### `runTests.js`
Lightweight test runner for quick development feedback.

## Running Tests

### Quick Test (Recommended for development)
```bash
npm run test-simple
```
Runs basic smoke tests to verify core functionality.

### Full Test Suite
```bash
npm run test
```
Runs the complete Mocha test suite in VS Code environment.

### Just Compile Tests
```bash
npm run test-compile
```
Verify tests compile without TypeScript errors.

## Test Scenarios Covered

### ✅ **Basic Functionality**
- Add, update, delete comments
- Persistent storage across sessions
- Comment counting and statistics

### ✅ **Smart Repositioning**
- Exact position matching (fastest path)
- Context-based line finding when code moves
- Smart handling of line insertions/deletions
- Multiple context matches disambiguation

### ✅ **Edge Cases**
- **Force Push**: Comments preserved when content unchanged
- **File Changes**: Only affected lines become outdated
- **Whitespace Changes**: Normalized comparison handles formatting
- **Line Ending Differences**: CRLF/LF normalization
- **Unicode Content**: Full UTF-8 support
- **Large Files**: Efficient handling of 1000+ line files
- **Empty Files**: Graceful handling of edge cases

### ✅ **Legacy Support**
- Migration from old `diffContext` format
- Backwards compatibility with anchor-less comments
- Graceful degradation for malformed data

### ✅ **Validation & Safety**
- Line number boundary checking
- Content hash verification
- Error handling with graceful fallbacks
- Debug information for troubleshooting

## Test Architecture

The test suite follows VS Code extension testing best practices:

1. **Mock VS Code API**: Complete mock implementation of `ExtensionContext`
2. **Isolated Storage**: Each test gets fresh storage state
3. **Real-world Scenarios**: Tests based on actual Git workflows
4. **Performance Validation**: Ensures system scales to large codebases

## Adding New Tests

When adding new test scenarios:

1. **Follow industry standards**: Model tests after proven code review practices
2. **Test both success and failure paths**: Ensure robust error handling
3. **Include edge cases**: Consider unusual but possible scenarios
4. **Verify WYSIWYG principle**: What user sees = what gets submitted

## Example Test Pattern

```typescript
test('should handle [specific scenario]', () => {
  // Arrange: Set up test data
  const comment = createComment(...);
  const fileDiff = createFileDiff(...);

  // Act: Perform the operation
  const result = storage.validateAndRepositionComment(comment, fileDiff);

  // Assert: Verify expected behavior
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.status, 'current');
});
```

This ensures our comment system is robust and reliable using proven industry approaches.
