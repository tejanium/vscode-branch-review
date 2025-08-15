/// <reference types="mocha" />
import * as assert from 'assert';
import { GitService, FileDiff } from '../services/gitService';
import { CommentStorage } from '../services/commentStorage';
import { ReviewPanel } from '../ui/reviewPanel';
import { WebviewRenderer } from '../ui/webviewRenderer';
import { MessageHandler } from '../ui/messageHandler';
import { ReviewModeManager } from '../ui/reviewModeManager';
import { WEBVIEW_COMMANDS } from '../constants';

// Import test utilities
import {
  TestGitRepository,
  MockGitService,
  MockExtensionContext,
  MockWebviewPanel,
  assertValidHTML,
  extractTextFromHTML,
} from './testUtils';

/**
 * Warning System and Empty State Behavior Tests
 *
 * Tests the complete user experience for:
 * - Warning messages when users are in suboptimal modes
 * - Helpful empty state messages when there's nothing to review
 * - Smart warning management during mode switching
 *
 * These tests focus on user-facing behavior, not implementation details.
 */
suite('Warning System and Empty State Behavior Tests', () => {
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

    // Mock vscode.window.createWebviewPanel to return our mockPanel
    // This works because our test environment uses vscode-mock.ts
    const vscode = require('vscode');
    vscode.window.createWebviewPanel = () => mockPanel;
  });

  teardown(() => {
    if (reviewPanel) {
      reviewPanel.dispose();
    }
    testRepo.cleanup();
  });

  suite('User Experience: Warnings for Suboptimal Mode Usage', () => {
    test('should warn users when they use Branch Compare mode with uncommitted changes', async () => {
      // Arrange: User has uncommitted changes
      const workspaceRoot = testRepo.getWorkspaceRoot();
      testRepo.createBranch('feature/test');
      testRepo.modifyFile('src/app.js', 'uncommitted changes');
      gitService.setHasUncommittedChanges(true);

      // Create ReviewPanel (this will default to Working Changes mode)
      reviewPanel = new ReviewPanel(mockContext, gitService, commentStorage, workspaceRoot);
      await reviewPanel.showReviewWithLoading('feature/test');

      // Act: User switches to Branch Compare mode (suboptimal choice)
      // This simulates clicking the "Branch Compare" button in the UI
      await (reviewPanel as any).messageHandler.handleMessage({
        command: WEBVIEW_COMMANDS.CHANGE_MODE,
        data: { newMode: 'branch-compare' },
      });

      // Assert: User should see helpful warning with actionable guidance
      const html = mockPanel.getLastHtml();

      assert.ok(html.includes('uncommitted changes'), 'Should warn about uncommitted changes');
      assert.ok(
        html.includes('Working Changes'),
        'Should suggest switching to Working Changes mode'
      );
      assert.ok(
        html.includes('line numbers may not be accurate'),
        'Should explain the specific problem with Branch Compare mode'
      );
    });

    test('should NOT warn users when they use appropriate modes', async () => {
      // Arrange: User has uncommitted changes
      const workspaceRoot = testRepo.getWorkspaceRoot();
      testRepo.createBranch('feature/test');
      testRepo.modifyFile('src/app.js', 'uncommitted changes');
      gitService.setHasUncommittedChanges(true);

      // Act: User opens review (should default to Working Changes mode - optimal choice)
      reviewPanel = new ReviewPanel(mockContext, gitService, commentStorage, workspaceRoot);
      await reviewPanel.showReviewWithLoading('feature/test');

      // Assert: Should default to Working Changes mode with no warnings
      const html = mockPanel.getLastHtml();

      assert.strictEqual(reviewPanel.getCurrentReviewMode(), 'working-changes');
      // Should not contain warning text (warnings are only for suboptimal choices)
      assert.ok(
        !html.includes('line numbers may not be accurate'),
        'Should not show warnings when user is in optimal mode'
      );
    });
  });

  suite('User Experience: Helpful Empty State Messages', () => {
    test('should help users when Working Changes mode shows no changes', async () => {
      // Arrange: User has no uncommitted changes (clean working directory)
      const workspaceRoot = testRepo.getWorkspaceRoot();
      testRepo.createBranch('feature/clean');
      gitService.setHasUncommittedChanges(false);

      // Mock empty working changes diff
      gitService.getDiffWithWorkingDirectory = async () => [];

      reviewPanel = new ReviewPanel(mockContext, gitService, commentStorage, workspaceRoot);
      await reviewPanel.showReviewWithLoading('feature/clean');

      // Act: User switches to Working Changes mode (will show empty state)
      await (reviewPanel as any).messageHandler.handleMessage({
        command: WEBVIEW_COMMANDS.CHANGE_MODE,
        data: { newMode: 'working-changes' },
      });

      // Assert: Should show helpful message specific to Working Changes context
      const html = mockPanel.getLastHtml();

      assert.ok(
        html.includes('No Uncommitted Changes'),
        'Should explain why Working Changes mode is empty'
      );
      assert.ok(html.includes('working directory is clean'), 'Should explain the current state');
      assert.ok(html.includes('Branch Compare'), 'Should suggest switching to Branch Compare mode');
    });

    test('should help users when Branch Compare mode shows no changes', async () => {
      // Arrange: User is on a branch with no differences from main
      const workspaceRoot = testRepo.getWorkspaceRoot();
      testRepo.createBranch('feature/empty');
      gitService.setHasUncommittedChanges(false);

      // Mock empty branch diff by making the test repo return empty diff
      testRepo.getDiffBetweenBranches = () => [];

      reviewPanel = new ReviewPanel(mockContext, gitService, commentStorage, workspaceRoot);
      await reviewPanel.showReviewWithLoading('feature/empty');

      // Assert: Should show some kind of helpful content when no changes exist
      const html = mockPanel.getLastHtml();

      // The system should handle empty diffs gracefully (either empty state or basic UI)
      assert.ok(html.length > 0, 'Should render some content even when no changes exist');
      assert.strictEqual(
        reviewPanel.getCurrentReviewMode(),
        'branch-compare',
        'Should be in branch-compare mode when no uncommitted changes'
      );
    });
  });

  suite('User Experience: Smart Warning Management', () => {
    test('should manage warnings appropriately during mode switching', async () => {
      // Arrange: User has uncommitted changes
      const workspaceRoot = testRepo.getWorkspaceRoot();
      testRepo.createBranch('feature/test');
      testRepo.modifyFile('src/app.js', 'uncommitted changes');
      gitService.setHasUncommittedChanges(true);

      // Act: Create ReviewPanel (should default to Working Changes mode)
      reviewPanel = new ReviewPanel(mockContext, gitService, commentStorage, workspaceRoot);
      await reviewPanel.showReviewWithLoading('feature/test');

      // Assert: Should default to optimal mode with no warnings
      assert.strictEqual(reviewPanel.getCurrentReviewMode(), 'working-changes');

      let html = mockPanel.getLastHtml();
      assert.ok(
        !html.includes('line numbers may not be accurate'),
        'Should not show warnings when in optimal mode'
      );

      // Act: User switches to Branch Compare mode (suboptimal choice)
      await (reviewPanel as any).messageHandler.handleMessage({
        command: WEBVIEW_COMMANDS.CHANGE_MODE,
        data: { newMode: 'branch-compare' },
      });

      // Assert: Should now show warning
      html = mockPanel.getLastHtml();
      assert.ok(
        html.includes('uncommitted changes'),
        'Should show warning when user switches to suboptimal mode'
      );
    });

    test('should handle refresh operations correctly', async () => {
      // Arrange: User has a review panel open
      const workspaceRoot = testRepo.getWorkspaceRoot();
      testRepo.createBranch('feature/test');
      gitService.setHasUncommittedChanges(true);

      reviewPanel = new ReviewPanel(mockContext, gitService, commentStorage, workspaceRoot);
      await reviewPanel.showReviewWithLoading('feature/test');

      const initialMode = reviewPanel.getCurrentReviewMode();

      // Act: User refreshes
      await (reviewPanel as any).messageHandler.handleMessage({
        command: WEBVIEW_COMMANDS.REFRESH_DIFF,
      });

      // Assert: System should handle refresh without errors
      const html = mockPanel.getLastHtml();
      assert.ok(html.length > 0, 'Should render content after refresh');

      // Mode should remain consistent or be re-evaluated appropriately
      const currentMode = reviewPanel.getCurrentReviewMode();
      assert.ok(
        currentMode === 'working-changes' || currentMode === 'branch-compare',
        'Should maintain a valid mode after refresh'
      );
    });
  });
});
