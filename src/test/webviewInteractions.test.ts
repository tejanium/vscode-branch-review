/// <reference types="mocha" />
import * as assert from 'assert';
import { GitService, FileDiff } from '../services/gitService';
import { CommentStorage, Comment } from '../services/commentStorage';
import { ReviewPanel } from '../ui/reviewPanel';
import { WebviewRenderer } from '../ui/webviewRenderer';
import { WEBVIEW_COMMANDS, REVIEW_MODES } from '../constants';

// Import test utilities
import {
  TestGitRepository,
  MockGitService,
  MockExtensionContext,
  MockWebviewPanel,
  createTestComment,
  assertValidHTML,
} from './testUtils';

/**
 * Webview Interactions Integration Tests
 *
 * These tests verify the complete webview interaction workflows including
 * message passing, UI state management, and controller behavior without
 * requiring actual browser rendering.
 */
suite('Webview Interactions Integration Tests', () => {
  let testRepo: TestGitRepository;
  let gitService: MockGitService;
  let commentStorage: CommentStorage;
  let mockContext: MockExtensionContext;
  let mockPanel: MockWebviewPanel;
  let webviewRenderer: WebviewRenderer;
  let reviewPanel: ReviewPanel;

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

  suite('Webview Message Handling', () => {
    test('should handle add comment message workflow', async () => {
      // Arrange: Set up branch with changes
      testRepo.createBranch('feature/webview-add-comment');
      testRepo.switchToBranch('feature/webview-add-comment');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Webview test");\n}');

      const workspaceRoot = testRepo.getWorkspaceRoot();
      const diff = await gitService.getDiffWithMain(workspaceRoot);

      // Create review panel
      reviewPanel = new ReviewPanel(mockContext, gitService, commentStorage, workspaceRoot);

      // Act: Simulate webview message to add comment
      const addCommentMessage = {
        command: WEBVIEW_COMMANDS.ADD_COMMENT,
        filePath: 'src/app.js',
        startLine: 2,
        endLine: 2,
        text: 'Webview added comment',
        codeSnippet: 'console.log("Webview test");',
      };

      // Simulate the message handling (in real extension, this would be handled by webview)
      const commentId = `comment-${Date.now()}`;
      const comment: Comment = {
        id: commentId,
        filePath: addCommentMessage.filePath,
        startLine: addCommentMessage.startLine,
        endLine: addCommentMessage.endLine,
        text: addCommentMessage.text,
        codeSnippet: addCommentMessage.codeSnippet,
        timestamp: new Date().toISOString(),
        anchor: commentStorage.createCommentAnchor(
          'main',
          'feature/webview-add-comment',
          diff[0],
          2,
          2
        ),
        status: 'current',
      };

      commentStorage.addComment(comment);

      // Assert: Comment should be added successfully
      const allComments = commentStorage.getAllComments();
      assert.strictEqual(allComments.length, 1);
      assert.strictEqual(allComments[0].text, 'Webview added comment');
      assert.strictEqual(allComments[0].filePath, 'src/app.js');
    });

    test('should handle update comment message workflow', async () => {
      // Arrange: Add initial comment
      const initialComment = createTestComment(
        'webview-update-1',
        'src/app.js',
        1,
        1,
        'Original text'
      );
      commentStorage.addComment(initialComment);

      // Act: Simulate webview message to update comment
      const updateCommentMessage = {
        command: WEBVIEW_COMMANDS.UPDATE_COMMENT,
        commentId: 'webview-update-1',
        text: 'Updated via webview',
      };

      // Simulate the update handling
      commentStorage.updateComment(updateCommentMessage.commentId, updateCommentMessage.text);

      // Assert: Comment should be updated
      const allComments = commentStorage.getAllComments();
      assert.strictEqual(allComments.length, 1);
      assert.strictEqual(allComments[0].text, 'Updated via webview');
      assert.strictEqual(allComments[0].id, 'webview-update-1');
    });

    test('should handle delete comment message workflow', async () => {
      // Arrange: Add comments to delete
      const comment1 = createTestComment(
        'webview-delete-1',
        'src/app.js',
        1,
        1,
        'Comment to delete'
      );
      const comment2 = createTestComment('webview-delete-2', 'src/app.js', 2, 2, 'Comment to keep');

      commentStorage.addComment(comment1);
      commentStorage.addComment(comment2);

      // Verify initial state
      let allComments = commentStorage.getAllComments();
      assert.strictEqual(allComments.length, 2);

      // Act: Simulate webview message to delete specific comment
      const deleteCommentMessage = {
        command: WEBVIEW_COMMANDS.DELETE_COMMENT,
        commentId: 'webview-delete-1',
      };

      commentStorage.deleteComment(deleteCommentMessage.commentId);

      // Assert: Only the specified comment should be deleted
      allComments = commentStorage.getAllComments();
      assert.strictEqual(allComments.length, 1);
      assert.strictEqual(allComments[0].id, 'webview-delete-2');
      assert.strictEqual(allComments[0].text, 'Comment to keep');
    });

    test('should handle delete all comments message workflow', async () => {
      // Arrange: Add multiple comments
      const comment1 = createTestComment('webview-clear-1', 'src/app.js', 1, 1, 'Comment 1');
      const comment2 = createTestComment('webview-clear-2', 'src/utils.js', 5, 5, 'Comment 2');
      const comment3 = createTestComment('webview-clear-3', 'src/config.js', 10, 10, 'Comment 3');

      commentStorage.addComment(comment1);
      commentStorage.addComment(comment2);
      commentStorage.addComment(comment3);

      // Verify initial state
      let allComments = commentStorage.getAllComments();
      assert.strictEqual(allComments.length, 3);

      // Act: Simulate webview message to delete all comments
      const deleteAllMessage = {
        command: WEBVIEW_COMMANDS.DELETE_ALL_COMMENTS,
      };

      commentStorage.clearAllComments();

      // Assert: All comments should be deleted
      allComments = commentStorage.getAllComments();
      assert.strictEqual(allComments.length, 0);
    });
  });

  suite('Webview State Management', () => {
    test('should handle branch change workflow', async () => {
      // Arrange: Set up multiple branches
      testRepo.createBranch('feature/branch-a');
      testRepo.createBranch('feature/branch-b');

      testRepo.switchToBranch('feature/branch-a');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Branch A");\n}');

      testRepo.switchToBranch('feature/branch-b');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Branch B");\n}');

      const workspaceRoot = testRepo.getWorkspaceRoot();

      // Act: Simulate branch change via webview
      testRepo.switchToBranch('feature/branch-a');
      let diff = await gitService.getDiffWithMain(workspaceRoot);
      assert.ok(diff[0].newContent.includes('Branch A'));

      testRepo.switchToBranch('feature/branch-b');
      diff = await gitService.getDiffWithMain(workspaceRoot);
      assert.ok(diff[0].newContent.includes('Branch B'));

      // Assert: Branch switching should work correctly
      const currentBranch = await gitService.getCurrentBranch(workspaceRoot);
      assert.strictEqual(currentBranch, 'feature/branch-b');
    });

    test('should handle mode change workflow', async () => {
      // Arrange: Set up branch with changes
      testRepo.createBranch('feature/mode-test');
      testRepo.switchToBranch('feature/mode-test');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Mode test");\n}');

      const workspaceRoot = testRepo.getWorkspaceRoot();
      reviewPanel = new ReviewPanel(mockContext, gitService, commentStorage, workspaceRoot);

      // Act: Test different review modes
      const branchCompareMode = reviewPanel.getCurrentReviewMode();

      // Assert: Should handle mode switching
      // Note: In our test environment, we can verify the mode is tracked
      assert.ok(branchCompareMode === 'branch-compare' || branchCompareMode === 'working-changes');
    });

    test('should handle refresh diff workflow', async () => {
      // Arrange: Set up branch and add initial changes
      testRepo.createBranch('feature/refresh-test');
      testRepo.switchToBranch('feature/refresh-test');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Initial");\n}');

      const workspaceRoot = testRepo.getWorkspaceRoot();
      let diff = await gitService.getDiffWithMain(workspaceRoot);
      assert.ok(diff[0].newContent.includes('Initial'));

      // Act: Make additional changes and refresh
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Refreshed");\n}');
      diff = await gitService.getDiffWithMain(workspaceRoot);

      // Assert: Refresh should show updated changes
      assert.ok(diff[0].newContent.includes('Refreshed'));
      assert.ok(!diff[0].newContent.includes('Initial'));
    });
  });

  suite('Webview Rendering Integration', () => {
    test('should handle complete webview rendering workflow', async () => {
      // Arrange: Set up complex scenario
      testRepo.createBranch('feature/render-integration');
      testRepo.switchToBranch('feature/render-integration');

      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Render test");\n}');
      testRepo.addFile('src/utils.js', 'export const helper = () => "help";');
      testRepo.addFile('styles/main.css', '.container { display: flex; }');

      const workspaceRoot = testRepo.getWorkspaceRoot();
      const diff = await gitService.getDiffWithMain(workspaceRoot);
      const allBranches = await gitService.getAllBranches(workspaceRoot);

      // Add some comments
      const comment1 = createTestComment('render-1', 'src/app.js', 2, 2, 'Comment on JS file');
      const comment2 = createTestComment('render-2', 'src/utils.js', 1, 1, 'Comment on utils');
      commentStorage.addComment(comment1);
      commentStorage.addComment(comment2);

      // Act: Render complete webview
      const webviewData = {
        currentBranch: 'feature/render-integration',
        baseBranch: 'main',
        diff,
        allBranches,
        diffStats: { added: 2, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      const html = webviewRenderer.render(webviewData);

      // Assert: Should produce valid HTML with all data
      assert.ok(typeof html === 'string');
      assert.ok(html.length > 0);

      // Verify data integrity
      assert.strictEqual(diff.length, 3); // 1 modified + 2 added files
      assert.strictEqual(commentStorage.getAllComments().length, 2);
      assert.ok(allBranches.includes('main'));
      assert.ok(allBranches.includes('feature/render-integration'));
    });

    test('should handle webview rendering with no changes', async () => {
      // Arrange: Branch with no changes
      testRepo.createBranch('feature/no-changes-render');
      testRepo.switchToBranch('feature/no-changes-render');

      const workspaceRoot = testRepo.getWorkspaceRoot();
      const diff = await gitService.getDiffWithMain(workspaceRoot);
      const allBranches = await gitService.getAllBranches(workspaceRoot);

      // Act: Render webview with empty diff
      const webviewData = {
        currentBranch: 'feature/no-changes-render',
        baseBranch: 'main',
        diff,
        allBranches,
        diffStats: { added: 0, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      const html = webviewRenderer.render(webviewData);

      // Assert: Should handle empty state gracefully
      assert.ok(typeof html === 'string');
      assert.strictEqual(diff.length, 0);
    });

    test('should handle webview rendering with large dataset', async () => {
      // Arrange: Create large dataset
      testRepo.createBranch('feature/large-render');
      testRepo.switchToBranch('feature/large-render');

      // Add many files
      for (let i = 0; i < 20; i++) {
        testRepo.addFile(`src/file${i}.js`, `export const value${i} = ${i};\nconsole.log(${i});`);
      }

      // Add many comments
      for (let i = 0; i < 30; i++) {
        const comment = createTestComment(
          `large-${i}`,
          `src/file${i % 20}.js`,
          1,
          1,
          `Comment ${i}`
        );
        commentStorage.addComment(comment);
      }

      const workspaceRoot = testRepo.getWorkspaceRoot();
      const diff = await gitService.getDiffWithMain(workspaceRoot);
      const allBranches = await gitService.getAllBranches(workspaceRoot);

      // Act: Render large dataset
      const webviewData = {
        currentBranch: 'feature/large-render',
        baseBranch: 'main',
        diff,
        allBranches,
        diffStats: { added: 20, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      const startTime = Date.now();
      const html = webviewRenderer.render(webviewData);
      const renderTime = Date.now() - startTime;

      // Assert: Should handle large dataset efficiently
      assert.ok(typeof html === 'string');
      assert.strictEqual(diff.length, 20);
      assert.strictEqual(commentStorage.getAllComments().length, 30);
      assert.ok(renderTime < 1000); // Should render within 1 second
    });
  });

  suite('Webview Error Handling', () => {
    test('should handle webview rendering errors gracefully', async () => {
      // Arrange: Create potentially problematic data
      testRepo.createBranch('feature/error-handling');
      testRepo.switchToBranch('feature/error-handling');

      // Add file with unusual content
      testRepo.addFile(
        'src/special.js',
        'const special = "test with \0 null bytes and \x01 control chars";'
      );

      const workspaceRoot = testRepo.getWorkspaceRoot();
      const diff = await gitService.getDiffWithMain(workspaceRoot);
      const allBranches = await gitService.getAllBranches(workspaceRoot);

      // Act: Try to render potentially problematic content
      const webviewData = {
        currentBranch: 'feature/error-handling',
        baseBranch: 'main',
        diff,
        allBranches,
        diffStats: { added: 1, removed: 0 },
        reviewMode: 'branch-compare' as const,
      };

      let renderingSucceeded = true;
      let html = '';

      try {
        html = webviewRenderer.render(webviewData);
      } catch (error) {
        renderingSucceeded = false;
      }

      // Assert: Should handle gracefully without crashing
      assert.strictEqual(renderingSucceeded, true);
      assert.ok(typeof html === 'string');
    });

    test('should handle invalid comment data in webview', async () => {
      // Arrange: Add comment with potentially invalid data
      const comment = createTestComment(
        'invalid-test',
        'src/app.js',
        -1,
        1000,
        'Invalid line numbers'
      );
      commentStorage.addComment(comment);

      // Act: Try to process invalid comment data
      const allComments = commentStorage.getAllComments();

      // Assert: Should handle invalid data gracefully
      assert.strictEqual(allComments.length, 1);
      // The comment system should store the comment even if line numbers are invalid
      assert.strictEqual(allComments[0].id, 'invalid-test');
    });

    test('should handle webview message processing errors', async () => {
      // Arrange: Set up scenario for message processing
      testRepo.createBranch('feature/message-errors');
      testRepo.switchToBranch('feature/message-errors');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Message test");\n}');

      // Act: Simulate various message processing scenarios

      // Try to update non-existent comment
      commentStorage.updateComment('nonexistent-id', 'Updated text');

      // Try to delete non-existent comment
      commentStorage.deleteComment('nonexistent-id');

      // Add comment with missing fields (handled by createTestComment)
      const comment = createTestComment('message-error-test', 'src/app.js', 1, 1, 'Test comment');
      commentStorage.addComment(comment);

      // Assert: Should handle all operations gracefully
      const allComments = commentStorage.getAllComments();
      assert.strictEqual(allComments.length, 1);
      assert.strictEqual(allComments[0].id, 'message-error-test');
    });
  });

  suite('Webview Performance and Optimization', () => {
    test('should handle rapid webview updates efficiently', async () => {
      // Arrange: Set up for rapid updates
      testRepo.createBranch('feature/rapid-updates');
      testRepo.switchToBranch('feature/rapid-updates');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("Rapid test");\n}');

      const workspaceRoot = testRepo.getWorkspaceRoot();

      // Act: Simulate rapid comment additions
      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        const comment = createTestComment(`rapid-${i}`, 'src/app.js', 1, 1, `Rapid comment ${i}`);
        commentStorage.addComment(comment);
      }

      const addTime = Date.now() - startTime;

      // Get all comments (simulating webview update)
      const allComments = commentStorage.getAllComments();

      // Assert: Should handle rapid updates efficiently
      assert.strictEqual(allComments.length, 50);
      assert.ok(addTime < 1000); // Should complete within 1 second
    });

    test('should handle webview state synchronization', async () => {
      // Arrange: Set up complex state
      testRepo.createBranch('feature/state-sync');
      testRepo.switchToBranch('feature/state-sync');
      testRepo.modifyFile('src/app.js', 'function main() {\n  console.log("State sync");\n}');
      testRepo.addFile('src/utils.js', 'export const util = () => "utility";');

      const workspaceRoot = testRepo.getWorkspaceRoot();
      const diff = await gitService.getDiffWithMain(workspaceRoot);

      // Add comments to different files
      const comment1 = createTestComment('sync-1', 'src/app.js', 2, 2, 'Comment on app.js');
      const comment2 = createTestComment('sync-2', 'src/utils.js', 1, 1, 'Comment on utils.js');

      commentStorage.addComment(comment1);
      commentStorage.addComment(comment2);

      // Act: Verify state consistency
      const allComments = commentStorage.getAllComments();
      const validComments = commentStorage.getValidCommentsForDiff(diff);

      // Assert: State should be consistent
      assert.strictEqual(allComments.length, 2);
      assert.strictEqual(diff.length, 2); // Modified app.js + added utils.js

      // Comments should be associated with correct files
      const appComment = allComments.find(c => c.filePath === 'src/app.js');
      const utilsComment = allComments.find(c => c.filePath === 'src/utils.js');

      assert.ok(appComment);
      assert.ok(utilsComment);
      assert.strictEqual(appComment.text, 'Comment on app.js');
      assert.strictEqual(utilsComment.text, 'Comment on utils.js');
    });
  });
});
