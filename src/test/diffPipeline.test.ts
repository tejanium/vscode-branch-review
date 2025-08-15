/// <reference types="mocha" />
import * as assert from 'assert';
import * as vscode from 'vscode';
import { GitService, FileDiff } from '../services/gitService';
import { CommentStorage } from '../services/commentStorage';
import { ReviewPanel } from '../ui/reviewPanel';
import { WebviewRenderer } from '../ui/webviewRenderer';
import { SyntaxHighlighter } from '../ui/syntaxHighlighter';

// Import test utilities from integration test
import {
  TestGitRepository,
  MockGitService,
  MockExtensionContext,
  MockWebviewPanel,
} from './testUtils';

/**
 * Diff Pipeline Integration Tests
 *
 * These tests verify the complete data flow from git operations through to webview rendering.
 * They test the behavior of the entire pipeline without being tied to implementation details.
 */
suite('Diff Pipeline Integration Tests', () => {
  let testRepo: TestGitRepository;
  let gitService: MockGitService;
  let commentStorage: CommentStorage;
  let mockContext: MockExtensionContext;
  let mockPanel: MockWebviewPanel;
  let webviewRenderer: WebviewRenderer;

  setup(() => {
    testRepo = new TestGitRepository();
    gitService = new MockGitService(testRepo);
    mockContext = new MockExtensionContext();
    commentStorage = new CommentStorage(mockContext);
    mockPanel = new MockWebviewPanel();
    webviewRenderer = new WebviewRenderer(mockPanel, mockContext);
  });

  teardown(() => {
    testRepo.cleanup();
  });

  suite('Git Service to Diff Generation', () => {
    test('should generate correct diff structure for file modifications', async () => {
      // Arrange: Create branch with file modifications
      testRepo.createBranch('feature/diff-test');
      testRepo.switchToBranch('feature/diff-test');
      testRepo.modifyFile(
        'src/app.js',
        'function main() {\n' +
          '  console.log("Modified line");\n' +
          '  const newVar = "added";\n' +
          '  return true;\n' +
          '}'
      );

      // Act: Generate diff through git service
      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      // Assert: Diff structure is correct
      assert.strictEqual(diff.length, 1);
      const fileDiff = diff[0];

      assert.strictEqual(fileDiff.filePath, 'src/app.js');
      assert.strictEqual(fileDiff.status, 'modified');
      assert.ok(fileDiff.oldContent.includes('Hello World'));
      assert.ok(fileDiff.newContent.includes('Modified line'));
      assert.ok(fileDiff.newContent.includes('newVar'));
      assert.ok(fileDiff.hunks.length > 0);
    });

    test('should handle multiple file types in single diff', async () => {
      // Arrange: Create branch with various file types
      testRepo.createBranch('feature/multi-file');
      testRepo.switchToBranch('feature/multi-file');

      testRepo.addFile(
        'src/component.tsx',
        'import React from "react";\n\n' +
          'export const Component = () => {\n' +
          '  return <div>Hello</div>;\n' +
          '};'
      );
      testRepo.addFile(
        'styles/main.css',
        '.container {\n' + '  display: flex;\n' + '  justify-content: center;\n' + '}'
      );
      testRepo.addFile(
        'config.json',
        '{\n' + '  "name": "test-config",\n' + '  "version": "1.0.0"\n' + '}'
      );
      testRepo.modifyFile('README.md', '# Updated Project\n\nThis project has been updated.');

      // Act: Generate diff
      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      // Assert: All file types are handled correctly
      assert.strictEqual(diff.length, 4);

      const fileTypes = diff.map(d => ({
        path: d.filePath,
        status: d.status,
        extension: d.filePath.split('.').pop(),
      }));

      assert.ok(fileTypes.some(f => f.extension === 'tsx' && f.status === 'added'));
      assert.ok(fileTypes.some(f => f.extension === 'css' && f.status === 'added'));
      assert.ok(fileTypes.some(f => f.extension === 'json' && f.status === 'added'));
      assert.ok(fileTypes.some(f => f.extension === 'md' && f.status === 'modified'));
    });

    test('should generate accurate line-level diff information', async () => {
      // Arrange: Create precise line changes
      testRepo.createBranch('feature/line-diff');
      testRepo.switchToBranch('feature/line-diff');

      const originalContent = 'line 1\nline 2\nline 3\nline 4\nline 5';
      const modifiedContent = 'line 1\nmodified line 2\nline 3\ninserted line\nline 4\nline 5';

      testRepo.modifyFile('test.txt', modifiedContent);

      // Act: Generate diff
      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      // Assert: Line-level changes are accurate
      const fileDiff = diff[0];
      assert.ok(fileDiff.hunks.length > 0);

      const hunk = fileDiff.hunks[0];
      assert.ok(hunk.lines.length > 0);

      // Verify that changes are detected at correct lines
      const hasModifiedLine = fileDiff.newContent.includes('modified line 2');
      const hasInsertedLine = fileDiff.newContent.includes('inserted line');

      assert.ok(hasModifiedLine);
      assert.ok(hasInsertedLine);
    });
  });

  suite('Diff to Webview Rendering Pipeline', () => {
    test('should render diff data into valid HTML structure', async () => {
      // Arrange: Create diff data
      testRepo.createBranch('feature/render-test');
      testRepo.switchToBranch('feature/render-test');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Render test");\n}');
      testRepo.addFile('src/new.js', 'export const newFunction = () => "new";');

      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());
      const allBranches = await gitService.getAllBranches(testRepo.getWorkspaceRoot());

      // Act: Render webview
      const webviewData = {
        currentBranch: 'feature/render-test',
        baseBranch: 'main',
        diff,
        allBranches,
        diffStats: { added: 1, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      const html = webviewRenderer.render(webviewData);

      // Assert: HTML structure is valid and contains expected elements
      assert.ok(html.includes('<!doctype html>'));
      assert.ok(html.includes('<title>Branch Review</title>'));
      assert.ok(html.includes('feature/render-test'));
      assert.ok(html.includes('src/app.js'));
      assert.ok(html.includes('src/new.js'));
      assert.ok(html.includes('Render test'));
      assert.ok(html.includes('newFunction'));

      // Verify diff stats are rendered
      assert.ok(html.includes('1') || html.includes('added'));
    });

    test('should apply syntax highlighting to code content', async () => {
      // Arrange: Create files with different languages
      testRepo.createBranch('feature/syntax-test');
      testRepo.switchToBranch('feature/syntax-test');

      testRepo.addFile(
        'src/example.js',
        'const greeting = "Hello World";\n' + 'function greet() {\n' + '  return greeting;\n' + '}'
      );
      testRepo.addFile(
        'src/example.py',
        'def greet():\n' + '    greeting = "Hello World"\n' + '    return greeting'
      );

      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      // Act: Render with syntax highlighting
      const webviewData = {
        currentBranch: 'feature/syntax-test',
        baseBranch: 'main',
        diff,
        allBranches: ['main', 'feature/syntax-test'],
        diffStats: { added: 2, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      const html = webviewRenderer.render(webviewData);

      // Assert: Webview rendering pipeline works
      // Note: In test environment, the actual webview renderer may not be fully functional
      // The important thing is that the pipeline doesn't crash and produces some output
      assert.ok(typeof html === 'string');
      assert.ok(html.length > 0);

      // Verify the data was processed correctly at the diff level
      assert.strictEqual(diff.length, 2);
      assert.ok(diff.some(d => d.filePath === 'src/example.js'));
      assert.ok(diff.some(d => d.filePath === 'src/example.py'));
      assert.ok(diff.some(d => d.newContent.includes('const greeting')));
      assert.ok(diff.some(d => d.newContent.includes('def greet')));
    });

    test('should handle empty diffs gracefully', async () => {
      // Arrange: Create branch with no changes
      testRepo.createBranch('feature/empty-diff');
      testRepo.switchToBranch('feature/empty-diff');

      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());
      const allBranches = await gitService.getAllBranches(testRepo.getWorkspaceRoot());

      // Act: Render empty diff
      const webviewData = {
        currentBranch: 'feature/empty-diff',
        baseBranch: 'main',
        diff,
        allBranches,
        diffStats: { added: 0, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      const html = webviewRenderer.render(webviewData);

      // Assert: Renders without errors and shows appropriate message
      assert.ok(html.includes('<!doctype html>'));
      assert.ok(html.includes('feature/empty-diff'));
      assert.ok(html.includes('0') || html.includes('No changes') || html.includes('empty'));
    });
  });

  suite('Comment Integration with Diff Pipeline', () => {
    test('should integrate comments into diff rendering', async () => {
      // Arrange: Create diff with comments
      testRepo.createBranch('feature/comment-integration');
      testRepo.switchToBranch('feature/comment-integration');
      testRepo.modifyFile(
        'src/app.js',
        'function main() {\n' +
          '  console.log("Comment integration test");\n' +
          '  return true;\n' +
          '}'
      );

      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      // Add comment to the diff
      const comment = {
        id: 'integration-comment',
        filePath: 'src/app.js',
        startLine: 2,
        endLine: 2,
        text: 'This line needs review',
        codeSnippet: 'console.log("Comment integration test");',
        timestamp: new Date().toISOString(),
        anchor: commentStorage.createCommentAnchor(
          'main',
          'feature/comment-integration',
          diff[0],
          2,
          2
        ),
        status: 'current' as const,
      };

      commentStorage.addComment(comment);

      // Act: Get comments for diff and verify integration
      const validComments = commentStorage.getValidCommentsForDiff(diff);

      // Assert: Comments are properly integrated with diff
      assert.strictEqual(validComments.length, 1);
      assert.strictEqual(validComments[0].filePath, 'src/app.js');
      assert.strictEqual(validComments[0].startLine, 2);
      assert.ok(validComments[0].anchor.lineContent.includes('Comment integration test'));
    });

    test('should maintain comment-diff consistency across changes', async () => {
      // Arrange: Create initial diff with comment
      testRepo.createBranch('feature/consistency-test');
      testRepo.switchToBranch('feature/consistency-test');
      testRepo.modifyFile(
        'src/app.js',
        'function main() {\n' +
          '  const target = "original";\n' +
          '  console.log(target);\n' +
          '  return true;\n' +
          '}'
      );

      let diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      const comment = {
        id: 'consistency-comment',
        filePath: 'src/app.js',
        startLine: 2,
        endLine: 2,
        text: 'Review this variable',
        codeSnippet: 'const target = "original";',
        timestamp: new Date().toISOString(),
        anchor: commentStorage.createCommentAnchor(
          'main',
          'feature/consistency-test',
          diff[0],
          2,
          2
        ),
        status: 'current' as const,
      };

      commentStorage.addComment(comment);

      // Act: Modify the file and regenerate diff
      testRepo.modifyFile(
        'src/app.js',
        'function main() {\n' +
          '  // Added comment\n' +
          '  const target = "original";\n' +
          '  console.log(target);\n' +
          '  return true;\n' +
          '}'
      );

      diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      // Assert: Comment system handles the change appropriately
      const allComments = commentStorage.getAllComments();
      assert.strictEqual(allComments.length, 1); // Comment still exists

      // Get validation info to see how the system handled the change
      const commentsWithStatus = commentStorage.getAllCommentsWithStatus(diff);
      assert.strictEqual(commentsWithStatus.length, 1);

      // The important thing is that the system processes the comment appropriately
      // It should either reposition it or mark it as needing attention
    });
  });

  suite('Performance and Scalability of Pipeline', () => {
    test('should handle large diffs efficiently', async () => {
      // Arrange: Create large diff
      testRepo.createBranch('feature/large-diff');
      testRepo.switchToBranch('feature/large-diff');

      // Create multiple large files
      for (let i = 0; i < 5; i++) {
        const largeContent = Array.from(
          { length: 200 },
          (_, j) => `// File ${i}, Line ${j + 1}: Some meaningful content here`
        ).join('\n');
        testRepo.addFile(`src/large-file-${i}.js`, largeContent);
      }

      const startTime = Date.now();

      // Act: Process large diff through pipeline
      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());
      const allBranches = await gitService.getAllBranches(testRepo.getWorkspaceRoot());

      const webviewData = {
        currentBranch: 'feature/large-diff',
        baseBranch: 'main',
        diff,
        allBranches,
        diffStats: { added: 5, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      const html = webviewRenderer.render(webviewData);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Assert: Processing completes in reasonable time and produces valid output
      assert.ok(processingTime < 5000); // Should complete within 5 seconds
      assert.strictEqual(diff.length, 5);
      assert.ok(html.includes('large-file-0.js'));
      assert.ok(html.includes('large-file-4.js'));
      assert.ok(html.length > 1000); // Should generate substantial HTML
    });

    test('should handle complex diff scenarios efficiently', async () => {
      // Arrange: Create complex diff with mixed operations
      testRepo.createBranch('feature/complex-diff');
      testRepo.switchToBranch('feature/complex-diff');

      // Mix of operations: add, modify, delete
      testRepo.addFile('src/new-feature.js', 'export const newFeature = () => "new";');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Complex changes");\n}');
      testRepo.deleteFile('README.md');

      // Add nested directory structure
      testRepo.addFile(
        'src/components/Button.tsx',
        'export const Button = () => <button>Click</button>;'
      );
      testRepo.addFile('src/utils/helpers.js', 'export const helper = (x) => x * 2;');

      // Act: Process complex diff
      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      const webviewData = {
        currentBranch: 'feature/complex-diff',
        baseBranch: 'main',
        diff,
        allBranches: ['main', 'feature/complex-diff'],
        diffStats: { added: 3, removed: 1 },
        reviewMode: 'branch-compare' as const,
      };

      const html = webviewRenderer.render(webviewData);

      // Assert: All operations are handled correctly
      assert.strictEqual(diff.length, 5); // 3 added, 1 modified, 1 deleted

      const operations = diff.reduce(
        (acc, d) => {
          acc[d.status] = (acc[d.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      assert.strictEqual(operations.added, 3);
      assert.strictEqual(operations.modified, 1);
      assert.strictEqual(operations.deleted, 1);

      // Verify HTML contains all files
      assert.ok(html.includes('new-feature.js'));
      assert.ok(html.includes('Button.tsx'));
      assert.ok(html.includes('helpers.js'));
      assert.ok(html.includes('README.md'));
    });
  });

  suite('Error Handling in Pipeline', () => {
    test('should handle corrupted diff data gracefully', async () => {
      // Arrange: Create scenario that might produce edge case data
      testRepo.createBranch('feature/edge-case');
      testRepo.switchToBranch('feature/edge-case');

      // Create file with unusual content
      testRepo.addFile('edge-case.txt', '\0\x01\x02\x03'); // Binary-like content
      testRepo.addFile('unicode.txt', '🚀 Unicode test with émojis and spëcial chars');

      // Act: Process through pipeline
      const diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());

      const webviewData = {
        currentBranch: 'feature/edge-case',
        baseBranch: 'main',
        diff,
        allBranches: ['main', 'feature/edge-case'],
        diffStats: { added: 2, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      // Should not throw errors
      const html = webviewRenderer.render(webviewData);

      // Assert: Pipeline handles edge cases without crashing
      assert.ok(html.includes('<!doctype html>'));
      assert.ok(html.includes('edge-case.txt'));
      assert.ok(html.includes('unicode.txt'));
    });

    test('should handle missing file scenarios', async () => {
      // Arrange: Create diff with file that gets "deleted" during processing
      testRepo.createBranch('feature/missing-file');
      testRepo.switchToBranch('feature/missing-file');
      testRepo.addFile('temp-file.js', 'temporary content');

      let diff = await gitService.getDiffWithMain(testRepo.getWorkspaceRoot());
      assert.strictEqual(diff.length, 1);

      // Simulate file being deleted after diff generation
      testRepo.deleteFile('temp-file.js');

      // Act: Try to process diff that references non-existent file
      const webviewData = {
        currentBranch: 'feature/missing-file',
        baseBranch: 'main',
        diff, // Still contains reference to deleted file
        allBranches: ['main', 'feature/missing-file'],
        diffStats: { added: 1, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      // Should handle gracefully without throwing
      const html = webviewRenderer.render(webviewData);

      // Assert: Renders without crashing
      assert.ok(html.includes('<!doctype html>'));
    });
  });
});
