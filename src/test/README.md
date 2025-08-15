# Branch Review Comprehensive Test Suite

This directory contains comprehensive integration tests for the Branch Review extension that focus on behavior rather than implementation details.

## Test Philosophy

These tests follow the principles you requested:
1. **No unit tests** - All tests are integration tests covering complete workflows
2. **No VSCode UI** - Tests run without spinning up the VSCode interface
3. **Accurate behavior testing** - Tests verify actual user workflows and data flows
4. **Minimal mocking** - Only essential VSCode APIs are mocked, git operations use real logic
5. **Implementation-agnostic** - Tests focus on behavior, allowing refactoring without test changes
6. **High coverage** - Tests cover all major code paths through realistic scenarios
7. **Behavior-focused** - Tests verify what the extension does, not how it does it
8. **Refactor-safe** - Tests guard against regressions during implementation changes

## Test Files

### `integration.test.ts`
Main integration test suite covering complete user workflows:
- **Branch Review Workflow**: End-to-end branch comparison and switching
- **Comment Management**: Complete comment lifecycle with repositioning
- **File Operations**: Adding, modifying, and deleting files
- **Error Handling**: Edge cases and error scenarios
- **Performance**: Large files and many comments
- **Data Integrity**: Persistence and concurrent operations

### `diffPipeline.test.ts`
Tests the complete data pipeline from git operations to webview rendering:
- **Git Service Integration**: Diff generation and branch operations
- **Webview Rendering**: HTML generation and syntax highlighting
- **Comment Integration**: Comments integrated with diff rendering
- **Performance Testing**: Large diffs and complex scenarios
- **Error Handling**: Corrupted data and missing files

### `testUtils.ts`
Shared test utilities providing:
- **TestGitRepository**: In-memory git repository simulation
- **MockGitService**: Git service with realistic behavior
- **Mock VSCode APIs**: Minimal mocking of extension context and webview
- **Test Helpers**: Utilities for creating test data and assertions

## Running Tests

### Single Command (Recommended)
```bash
npm test
```
Runs the complete comprehensive test suite covering all functionality.

## Test Scenarios Covered

### ✅ **Complete User Workflows**
- **Branch Review**: Create branches, make changes, switch between branches
- **Comment Lifecycle**: Add, update, delete, and reposition comments
- **File Operations**: Add, modify, delete files with proper diff generation
- **Multi-file Changes**: Handle complex diffs with mixed operations
- **Branch Switching**: Maintain comment consistency across branch changes

### ✅ **Data Pipeline Integration**
- **Git to Diff**: Complete git service to diff generation pipeline
- **Diff to Webview**: Webview rendering with syntax highlighting
- **Comment Integration**: Comments properly integrated with diff rendering
- **Performance**: Large diffs and complex scenarios handled efficiently

### ✅ **Error Handling & Edge Cases**
- **Invalid Repositories**: Graceful handling of non-git directories
- **Large Files**: Efficient processing of 1000+ line files
- **Unicode Content**: Full UTF-8 support with emojis and special characters
- **Empty Files**: Proper handling of empty and whitespace-only files
- **Binary Content**: Graceful handling of binary-like content
- **Missing Files**: Robust handling of file system edge cases

### ✅ **Comment Intelligence**
- **Smart Repositioning**: Comments follow code when lines are moved
- **Context Anchoring**: Comments anchored with surrounding code context
- **Invalidation**: Comments marked outdated when referenced code changes
- **Multi-line Comments**: Proper handling of line ranges
- **Whitespace Tolerance**: Comments survive formatting changes

### ✅ **Performance & Scalability**
- **Many Branches**: Efficient handling of 20+ branches
- **Many Comments**: 100+ comments across multiple files
- **Large Diffs**: Complex diffs with multiple file types
- **Concurrent Operations**: Thread-safe comment operations
- **Memory Efficiency**: Proper cleanup and resource management

### ✅ **Data Integrity**
- **Persistence**: Comments survive across extension sessions
- **Concurrent Access**: Safe handling of simultaneous operations
- **State Consistency**: Consistent state across all operations
- **Error Recovery**: Graceful recovery from corrupted data

## Test Architecture

The test suite is designed for maximum reliability and maintainability:

1. **Behavior-Focused**: Tests verify what the extension does, not how
2. **Implementation-Agnostic**: Refactoring code won't break tests
3. **Realistic Scenarios**: Tests mirror actual user workflows
4. **Minimal Mocking**: Only essential APIs are mocked
5. **Fast Execution**: Tests run quickly without external dependencies
6. **Comprehensive Coverage**: All major code paths are tested

## Test Strategy

Each test follows a clear pattern:

```typescript
test('should handle [specific user scenario]', async () => {
  // Arrange: Set up realistic test scenario
  testRepo.createBranch('feature/test');
  testRepo.modifyFile('src/app.js', 'new content');

  // Act: Perform the complete workflow
  const diff = await gitService.getDiffWithMain(workspaceRoot);
  const comments = commentStorage.getValidCommentsForDiff(diff);

  // Assert: Verify expected behavior
  assert.strictEqual(diff.length, 1);
  assert.strictEqual(comments.length, 0);
});
```

This approach ensures tests are:
- **Readable**: Clear intent and expected outcomes
- **Reliable**: Consistent results across runs
- **Maintainable**: Easy to update when requirements change
- **Valuable**: Actually catch regressions and bugs
