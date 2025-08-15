/// <reference types="mocha" />
import * as assert from 'assert';
import * as vscode from 'vscode';
import { CommentStorage, Comment } from '../services/commentStorage';
import { FileDiff } from '../services/gitService';

// Mock VS Code extension context
class MockExtensionContext implements vscode.ExtensionContext {
  subscriptions: vscode.Disposable[] = [];
  workspaceState: vscode.Memento = new MockMemento();
  globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } =
    new MockMemento();
  extensionPath: string = '';
  extensionUri: vscode.Uri = vscode.Uri.file('');
  environmentVariableCollection: any = {
    getScoped: () => ({}),
  };
  extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Test;
  storageUri: vscode.Uri | undefined = undefined;
  globalStorageUri: vscode.Uri = vscode.Uri.file('');
  logUri: vscode.Uri = vscode.Uri.file('');
  secrets: vscode.SecretStorage = {} as any;
  extension: vscode.Extension<any> = {} as any;
  languageModelAccessInformation: vscode.LanguageModelAccessInformation = {} as any;
  storagePath: string | undefined = undefined;
  globalStoragePath: string = '/mock/global/storage';
  logPath: string = '/mock/log';

  asAbsolutePath(relativePath: string): string {
    return relativePath;
  }
}

class MockMemento implements vscode.Memento {
  private storage = new Map<string, any>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.storage.get(key) ?? defaultValue;
  }

  async update(key: string, value: any): Promise<void> {
    this.storage.set(key, value);
  }

  keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }

  setKeysForSync(keys: readonly string[]): void {
    // Mock implementation
  }
}

// Test utilities
function createFileDiff(filePath: string, content: string): FileDiff {
  return {
    filePath,
    status: 'modified',
    oldContent: '',
    newContent: content,
    hunks: [],
  };
}

function createComment(
  id: string,
  filePath: string,
  startLine: number,
  endLine: number,
  text: string,
  anchor?: Comment['anchor']
): Comment {
  return {
    id,
    filePath,
    startLine,
    endLine,
    text,
    codeSnippet: `Lines ${startLine}-${endLine}`,
    timestamp: new Date().toISOString(),
    anchor: anchor || {
      baseBranch: 'main',
      currentBranch: 'feature',
      lineContent: 'test content',
      contextLines: {
        before: [],
        after: [],
      },
      originalLineNumbers: {
        start: startLine,
        end: endLine,
      },
    },
    status: 'current',
  };
}

suite('CommentStorage Tests', () => {
  let storage: CommentStorage;
  let mockContext: MockExtensionContext;

  setup(() => {
    mockContext = new MockExtensionContext();
    storage = new CommentStorage(mockContext);
  });

  suite('Basic Comment Operations', () => {
    test('should add and retrieve comments', () => {
      const comment = createComment('1', 'test.js', 10, 12, 'Test comment');

      storage.addComment(comment);
      const comments = storage.getAllComments();

      assert.strictEqual(comments.length, 1);
      assert.strictEqual(comments[0].id, '1');
      assert.strictEqual(comments[0].text, 'Test comment');
    });

    test('should update comment text', () => {
      const comment = createComment('1', 'test.js', 10, 12, 'Original text');
      storage.addComment(comment);

      storage.updateComment('1', 'Updated text');
      const comments = storage.getAllComments();

      assert.strictEqual(comments[0].text, 'Updated text');
    });

    test('should delete comment by id', () => {
      const comment = createComment('1', 'test.js', 10, 12, 'Test comment');
      storage.addComment(comment);

      storage.deleteComment('1');
      const comments = storage.getAllComments();

      assert.strictEqual(comments.length, 0);
    });

    test('should delete comment by location', () => {
      const comment = createComment('1', 'test.js', 10, 12, 'Test comment');
      storage.addComment(comment);

      storage.deleteCommentByLocation('test.js', 10, 12);
      const comments = storage.getAllComments();

      assert.strictEqual(comments.length, 0);
    });

    test('should clear all comments', () => {
      storage.addComment(createComment('1', 'test.js', 10, 12, 'Comment 1'));
      storage.addComment(createComment('2', 'test.js', 20, 22, 'Comment 2'));

      storage.clearAllComments();
      const comments = storage.getAllComments();

      assert.strictEqual(comments.length, 0);
    });
  });

  suite('Anchor Creation', () => {
    test('should create proper anchor with context lines', () => {
      const fileContent = [
        'line 1',
        'line 2',
        'line 3',
        'target line 1',
        'target line 2',
        'line 6',
        'line 7',
        'line 8',
      ].join('\n');

      const fileDiff = createFileDiff('test.js', fileContent);
      const anchor = storage.createCommentAnchor('main', 'feature', fileDiff, 4, 5);

      assert.strictEqual(anchor.lineContent, 'target line 1\ntarget line 2');
      assert.deepStrictEqual(anchor.contextLines.before, ['line 1', 'line 2', 'line 3']);
      assert.deepStrictEqual(anchor.contextLines.after, ['line 6', 'line 7', 'line 8']);
      assert.strictEqual(anchor.originalLineNumbers.start, 4);
      assert.strictEqual(anchor.originalLineNumbers.end, 5);
    });

    test('should handle edge cases in anchor creation', () => {
      const fileContent = 'line 1\nline 2\nline 3';
      const fileDiff = createFileDiff('test.js', fileContent);

      // Comment at beginning of file
      const anchorStart = storage.createCommentAnchor('main', 'feature', fileDiff, 1, 1);
      assert.deepStrictEqual(anchorStart.contextLines.before, []);

      // Comment at end of file
      const anchorEnd = storage.createCommentAnchor('main', 'feature', fileDiff, 3, 3);
      assert.deepStrictEqual(anchorEnd.contextLines.after, []);
    });
  });

  suite('Comment Validation and Repositioning', () => {
    test('should validate comment at exact position', () => {
      const fileContent = ['line 1', 'function test() {', '  return true;', '}', 'line 5'].join(
        '\n'
      );

      const anchor = {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'function test() {\n  return true;',
        contextLines: {
          before: ['line 1'],
          after: ['}', 'line 5'],
        },
        originalLineNumbers: { start: 2, end: 3 },
      };

      const comment = createComment('1', 'test.js', 2, 3, 'Test comment', anchor);
      const fileDiff = createFileDiff('test.js', fileContent);

      const result = storage.validateAndRepositionComment(comment, fileDiff);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.status, 'current');
      assert.strictEqual(result.newPosition?.startLine, 2);
      assert.strictEqual(result.newPosition?.endLine, 3);
    });

    test('should detect when lines are moved and reposition comment', () => {
      const originalContent = ['line 1', 'function test() {', '  return true;', '}', 'line 5'].join(
        '\n'
      );

      const newContent = [
        'line 1',
        'added line',
        'another added line',
        'function test() {',
        '  return true;',
        '}',
        'line 5',
      ].join('\n');

      const anchor = {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'function test() {\n  return true;',
        contextLines: {
          before: ['line 1'],
          after: ['}', 'line 5'],
        },
        originalLineNumbers: { start: 2, end: 3 },
      };

      const comment = createComment('1', 'test.js', 2, 3, 'Test comment', anchor);
      const fileDiff = createFileDiff('test.js', newContent);

      const result = storage.validateAndRepositionComment(comment, fileDiff);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.status, 'moved');
      assert.strictEqual(result.newPosition?.startLine, 4);
      assert.strictEqual(result.newPosition?.endLine, 5);
    });

    test('should mark comment as outdated when content changes', () => {
      const newContent = [
        'line 1',
        'function test() {',
        '  return false;', // Changed from 'return true;'
        '}',
        'line 5',
      ].join('\n');

      const anchor = {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'function test() {\n  return true;', // Original content
        contextLines: {
          before: ['line 1'],
          after: ['}', 'line 5'],
        },
        originalLineNumbers: { start: 2, end: 3 },
      };

      const comment = createComment('1', 'test.js', 2, 3, 'Test comment', anchor);
      const fileDiff = createFileDiff('test.js', newContent);

      const result = storage.validateAndRepositionComment(comment, fileDiff);

      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.status, 'outdated');
    });

    test('should handle line numbers out of bounds', () => {
      const shortContent = 'line 1\nline 2';
      const anchor = {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'line 5\nline 6',
        contextLines: { before: [], after: [] },
        originalLineNumbers: { start: 5, end: 6 },
      };

      const comment = createComment('1', 'test.js', 5, 6, 'Test comment', anchor);
      const fileDiff = createFileDiff('test.js', shortContent);

      const result = storage.validateAndRepositionComment(comment, fileDiff);

      assert.strictEqual(result.isValid, false);
      assert.strictEqual(result.status, 'outdated');
    });
  });

  suite('Edge Cases and Force Push Scenarios', () => {
    test('should handle force push with identical content', () => {
      const content = 'function test() {\n  return true;\n}';

      const anchor = {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'function test() {\n  return true;',
        contextLines: {
          before: [],
          after: ['}'],
        },
        originalLineNumbers: { start: 1, end: 2 },
      };

      const comment = createComment('1', 'test.js', 1, 2, 'Test comment', anchor);
      const fileDiff = createFileDiff('test.js', content);

      const result = storage.validateAndRepositionComment(comment, fileDiff);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.status, 'current');
    });

    test('should handle whitespace and line ending differences', () => {
      const originalContent = 'function test() {\n  return true;\n}';
      const newContentWithSpaces = 'function test() {  \n  return true;  \n}  '; // Extra spaces

      const anchor = {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'function test() {\n  return true;',
        contextLines: {
          before: [],
          after: ['}'],
        },
        originalLineNumbers: { start: 1, end: 2 },
      };

      const comment = createComment('1', 'test.js', 1, 2, 'Test comment', anchor);
      const fileDiff = createFileDiff('test.js', newContentWithSpaces);

      const result = storage.validateAndRepositionComment(comment, fileDiff);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.status, 'current');
    });

    test('should handle CRLF vs LF line ending differences', () => {
      const crlfContent = 'line 1\r\nline 2\r\nline 3';
      const lfContent = 'line 1\nline 2\nline 3';

      const anchor = {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'line 1\nline 2',
        contextLines: {
          before: [],
          after: ['line 3'],
        },
        originalLineNumbers: { start: 1, end: 2 },
      };

      const comment = createComment('1', 'test.js', 1, 2, 'Test comment', anchor);
      const fileDiff = createFileDiff('test.js', crlfContent);

      const result = storage.validateAndRepositionComment(comment, fileDiff);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.status, 'current');
    });

    test('should handle complex repositioning with multiple context matches', () => {
      const newContent = [
        'function helper() {',
        '  return false;',
        '}',
        'other code',
        'function test() {', // This is what we're looking for
        '  return true;',
        '}',
        'function helper() {', // Duplicate context that should not match
        '  return false;',
        '}',
      ].join('\n');

      const anchor = {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'function test() {\n  return true;',
        contextLines: {
          before: ['other code'],
          after: ['}'],
        },
        originalLineNumbers: { start: 2, end: 3 },
      };

      const comment = createComment('1', 'test.js', 2, 3, 'Test comment', anchor);
      const fileDiff = createFileDiff('test.js', newContent);

      const result = storage.validateAndRepositionComment(comment, fileDiff);

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.status, 'moved');
      assert.strictEqual(result.newPosition?.startLine, 5);
      assert.strictEqual(result.newPosition?.endLine, 6);
    });
  });

  suite('Legacy Comment Handling', () => {
    test('should migrate legacy comments without anchor', () => {
      const legacyComment = {
        id: '1',
        filePath: 'test.js',
        startLine: 10,
        endLine: 12,
        text: 'Legacy comment',
        codeSnippet: 'Lines 10-12',
        timestamp: new Date().toISOString(),
      };

      // Directly store legacy format
      mockContext.globalState.update('branchReview.comments', [legacyComment]);

      const comments = storage.getAllComments();

      assert.strictEqual(comments.length, 1);
      assert.strictEqual(comments[0].status, 'outdated');
      assert.ok(comments[0].anchor);
      assert.strictEqual(comments[0].anchor.baseBranch, 'legacy');
    });

    test('should migrate legacy comments with old diffContext', () => {
      const legacyComment = {
        id: '1',
        filePath: 'test.js',
        startLine: 10,
        endLine: 12,
        text: 'Legacy comment',
        codeSnippet: 'Lines 10-12',
        timestamp: new Date().toISOString(),
        diffContext: {
          baseBranch: 'main',
          currentBranch: 'feature',
          fileHash: 'old-hash',
          lineHash: 'old-hash',
          diffSessionId: 'old-session',
        },
      };

      mockContext.globalState.update('branchReview.comments', [legacyComment]);

      const comments = storage.getAllComments();

      assert.strictEqual(comments.length, 1);
      assert.strictEqual(comments[0].anchor.baseBranch, 'main');
      assert.strictEqual(comments[0].anchor.currentBranch, 'feature');
      assert.strictEqual(comments[0].status, 'outdated');
    });
  });

  suite('Diff Session Management', () => {});

  suite('Filtering and Validation', () => {
    test('should return only valid comments for current diff', () => {
      const validComment = createComment('1', 'test.js', 1, 2, 'Valid comment', {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'line 1\nline 2',
        contextLines: { before: [], after: ['line 3'] },
        originalLineNumbers: { start: 1, end: 2 },
      });

      const invalidComment = createComment('2', 'test.js', 5, 6, 'Invalid comment', {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'old content',
        contextLines: { before: [], after: [] },
        originalLineNumbers: { start: 5, end: 6 },
      });

      storage.addComment(validComment);
      storage.addComment(invalidComment);

      const fileDiffs = [createFileDiff('test.js', 'line 1\nline 2\nline 3')];
      const validComments = storage.getValidCommentsForDiff(fileDiffs);

      assert.strictEqual(validComments.length, 1);
      assert.strictEqual(validComments[0].id, '1');
    });

    test('should update comment positions when moved', () => {
      const comment = createComment('1', 'test.js', 2, 3, 'Test comment', {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'function test() {\n  return true;',
        contextLines: {
          before: ['line 1'],
          after: ['}'],
        },
        originalLineNumbers: { start: 2, end: 3 },
      });

      storage.addComment(comment);

      const newContent = ['line 1', 'added line', 'function test() {', '  return true;', '}'].join(
        '\n'
      );

      const fileDiffs = [createFileDiff('test.js', newContent)];
      const validComments = storage.getValidCommentsForDiff(fileDiffs);

      assert.strictEqual(validComments.length, 1);
      assert.strictEqual(validComments[0].startLine, 3);
      assert.strictEqual(validComments[0].endLine, 4);
      assert.strictEqual(validComments[0].status, 'moved');
    });
  });

  suite('Debug and Status Information', () => {
    test('should provide detailed validation info', () => {
      const comment = createComment('1', 'test.js', 10, 12, 'Test comment');
      const fileDiff = createFileDiff('test.js', 'short file');

      const info = storage.getCommentValidationInfo(comment, fileDiff);

      assert.strictEqual(info.valid, false);
      assert.ok(info.reason?.includes('out of bounds'));
    });

    test('should return all comments with status information', () => {
      const comment1 = createComment('1', 'test.js', 1, 2, 'Valid comment', {
        baseBranch: 'main',
        currentBranch: 'feature',
        lineContent: 'line 1\nline 2',
        contextLines: { before: [], after: [] },
        originalLineNumbers: { start: 1, end: 2 },
      });

      const comment2 = createComment('2', 'other.js', 1, 2, 'Missing file comment');

      storage.addComment(comment1);
      storage.addComment(comment2);

      const fileDiffs = [createFileDiff('test.js', 'line 1\nline 2')];
      const commentsWithStatus = storage.getAllCommentsWithStatus(fileDiffs);

      assert.strictEqual(commentsWithStatus.length, 2);
      assert.strictEqual(commentsWithStatus[0].validationInfo.isValid, true);
      assert.strictEqual(commentsWithStatus[1].validationInfo.isValid, false);
      assert.strictEqual(commentsWithStatus[1].validationInfo.reason, 'File not in current diff');
    });
  });

  suite('Performance and Content Tests', () => {
    test('should handle large files efficiently', () => {
      const largeContent = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join('\n');
      const fileDiff = createFileDiff('large.js', largeContent);

      const anchor = storage.createCommentAnchor('main', 'feature', fileDiff, 500, 502);

      assert.strictEqual(anchor.lineContent, 'line 500\nline 501\nline 502');
      assert.strictEqual(anchor.contextLines.before.length, 3);
      assert.strictEqual(anchor.contextLines.after.length, 3);
    });

    test('should handle unicode content correctly', () => {
      const unicodeContent = 'function test() {\n  return "こんにちは世界";\n}';
      const fileDiff = createFileDiff('test.js', unicodeContent);

      const anchor = storage.createCommentAnchor('main', 'feature', fileDiff, 1, 2);

      assert.ok(anchor.lineContent.includes('こんにちは世界'));
    });

    test('should handle empty files gracefully', () => {
      const emptyContent = '';
      const fileDiff = createFileDiff('empty.js', emptyContent);

      const comments = storage.getValidCommentsForDiff([fileDiff]);

      assert.strictEqual(comments.length, 0);
    });
  });
});
