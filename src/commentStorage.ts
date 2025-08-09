import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { STORAGE_KEYS } from './constants';
import { FileDiff } from './gitService';

export interface Comment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
  codeSnippet: string;
  timestamp: string;
  // Industry-standard approach
  anchor: {
    baseBranch: string; // For display purposes
    currentBranch: string; // For display purposes
    lineContent: string; // Exact content of the commented lines
    contextLines: {
      before: string[]; // Lines before the comment (for repositioning)
      after: string[]; // Lines after the comment (for repositioning)
    };
    originalLineNumbers: {
      start: number;
      end: number;
    };
  };
  status: 'current' | 'outdated' | 'moved'; // Comment status tracking
}

export class CommentStorage {
  private static readonly STORAGE_KEY = STORAGE_KEYS.COMMENTS;
  private context: vscode.ExtensionContext;
  private currentDiffSessionId: string = '';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // Generate anchor data for a comment with context
  createCommentAnchor(
    baseBranch: string,
    currentBranch: string,
    fileDiff: FileDiff,
    startLine: number,
    endLine: number
  ): Comment['anchor'] {
    const fileLines = fileDiff.newContent.split('\n');

    // Extract the commented lines
    const commentedLines = fileLines.slice(startLine - 1, endLine);
    const lineContent = commentedLines.join('\n');

    // Capture context lines for repositioning (using 3 lines of context)
    const contextSize = 3;
    const beforeStart = Math.max(0, startLine - 1 - contextSize);
    const afterEnd = Math.min(fileLines.length, endLine + contextSize);

    const before = fileLines.slice(beforeStart, startLine - 1);
    const after = fileLines.slice(endLine, afterEnd);

    return {
      baseBranch,
      currentBranch,
      lineContent,
      contextLines: {
        before,
        after,
      },
      originalLineNumbers: {
        start: startLine,
        end: endLine,
      },
    };
  }

  // Set the current diff session ID (called when diff is loaded)
  setDiffSessionId(baseBranch: string, currentBranch: string, fileDiffs: FileDiff[]): void {
    // Create a unique session ID based ONLY on diff content, not branch names
    // This way, force pushes that don't change content won't invalidate comments
    const diffSignature = fileDiffs
      .map(file => `${file.filePath}:${this.hashString(file.newContent)}`)
      .join('|');
    this.currentDiffSessionId = this.hashString(diffSignature);
  }

  // Advanced comment validation with smart repositioning
  validateAndRepositionComment(
    comment: Comment,
    currentFileDiff: FileDiff
  ): {
    isValid: boolean;
    newPosition?: { startLine: number; endLine: number };
    status: 'current' | 'outdated' | 'moved';
    reason: string;
  } {
    try {
      // Handle legacy comments
      if (!comment.anchor) {
        return { isValid: false, status: 'outdated', reason: 'Legacy comment format' };
      }

      const currentLines = currentFileDiff.newContent.split('\n');

      // First, try exact position match (most common case)
      if (this.checkExactPosition(comment, currentLines)) {
        return {
          isValid: true,
          status: 'current',
          reason: 'Lines unchanged at original position',
          newPosition: { startLine: comment.startLine, endLine: comment.endLine },
        };
      }

      // Try to find the lines using surrounding context
      const repositionResult = this.findLinesWithContext(comment, currentLines);
      if (repositionResult.found) {
        return {
          isValid: true,
          status: 'moved',
          reason: `Lines moved from ${comment.startLine}-${comment.endLine} to ${repositionResult.startLine}-${repositionResult.endLine}`,
          newPosition: {
            startLine: repositionResult.startLine!,
            endLine: repositionResult.endLine!,
          },
        };
      }

      // Lines not found - mark as outdated but keep accessible
      return {
        isValid: false,
        status: 'outdated',
        reason: 'Lines have been modified or removed',
      };
    } catch (error) {
      console.warn('Error validating comment:', error, comment);
      return { isValid: false, status: 'outdated', reason: `Validation error: ${error}` };
    }
  }

  private checkExactPosition(comment: Comment, currentLines: string[]): boolean {
    if (comment.endLine > currentLines.length) {
      return false;
    }

    const currentContent = currentLines.slice(comment.startLine - 1, comment.endLine).join('\n');
    return (
      this.normalizeContent(currentContent) === this.normalizeContent(comment.anchor.lineContent)
    );
  }

  private findLinesWithContext(
    comment: Comment,
    currentLines: string[]
  ): {
    found: boolean;
    startLine?: number;
    endLine?: number;
  } {
    const anchor = comment.anchor;
    const targetContent = this.normalizeContent(anchor.lineContent);
    const beforeContext = anchor.contextLines.before;
    const afterContext = anchor.contextLines.after;

    // Search for the pattern: before context + target content + after context
    for (let i = 0; i < currentLines.length; i++) {
      // Check if we can match the before context
      if (beforeContext.length > 0) {
        const beforeStart = i - beforeContext.length;
        if (beforeStart < 0) continue;

        const currentBefore = currentLines.slice(beforeStart, i);
        if (!this.arraysMatch(beforeContext, currentBefore)) continue;
      }

      // Check if we can match the target content
      const contentLength = comment.endLine - comment.startLine + 1;
      if (i + contentLength > currentLines.length) break;

      const currentContent = currentLines.slice(i, i + contentLength).join('\n');
      if (this.normalizeContent(currentContent) !== targetContent) continue;

      // Check if we can match the after context
      if (afterContext.length > 0) {
        const afterStart = i + contentLength;
        if (afterStart + afterContext.length > currentLines.length) continue;

        const currentAfter = currentLines.slice(afterStart, afterStart + afterContext.length);
        if (!this.arraysMatch(afterContext, currentAfter)) continue;
      }

      // Found a match!
      return {
        found: true,
        startLine: i + 1, // Convert to 1-based indexing
        endLine: i + contentLength,
      };
    }

    return { found: false };
  }

  private normalizeContent(content: string): string {
    // Normalize whitespace and line endings for comparison
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  private arraysMatch(arr1: string[], arr2: string[]): boolean {
    if (arr1.length !== arr2.length) return false;
    return arr1.every(
      (line, index) => this.normalizeContent(line) === this.normalizeContent(arr2[index])
    );
  }

  // Get detailed validation info for debugging
  getCommentValidationInfo(
    comment: Comment,
    currentFileDiff: FileDiff
  ): {
    valid: boolean;
    reason?: string;
    originalLines?: string;
    currentLines?: string;
  } {
    try {
      if (!comment.anchor) {
        return { valid: false, reason: 'Legacy comment without anchor data' };
      }

      const currentLines = currentFileDiff.newContent.split('\n');

      if (comment.startLine < 1 || comment.endLine > currentLines.length) {
        return {
          valid: false,
          reason: `Line numbers out of bounds: ${comment.startLine}-${comment.endLine} vs file length ${currentLines.length}`,
        };
      }

      if (comment.startLine > comment.endLine) {
        return {
          valid: false,
          reason: `Invalid line range: ${comment.startLine}-${comment.endLine}`,
        };
      }

      const commentedLines = currentLines.slice(comment.startLine - 1, comment.endLine).join('\n');
      const currentContent = this.normalizeContent(commentedLines);
      const anchorContent = this.normalizeContent(comment.anchor.lineContent);
      const valid = currentContent === anchorContent;

      return {
        valid,
        reason: valid ? 'Lines match' : 'Line content has changed',
        originalLines: comment.codeSnippet,
        currentLines: commentedLines,
      };
    } catch (error) {
      return { valid: false, reason: `Validation error: ${error}` };
    }
  }

  // Get comments with advanced validation and repositioning
  getValidCommentsForDiff(fileDiffs: FileDiff[]): Comment[] {
    const allComments = this.getAllComments();
    const validComments: Comment[] = [];

    // Create a map for quick file lookup
    const fileDiffMap = new Map(fileDiffs.map(diff => [diff.filePath, diff]));

    for (const comment of allComments) {
      const fileDiff = fileDiffMap.get(comment.filePath);
      if (fileDiff) {
        const validation = this.validateAndRepositionComment(comment, fileDiff);

        if (validation.isValid) {
          // Update comment position if it moved
          if (validation.newPosition && validation.status === 'moved') {
            comment.startLine = validation.newPosition.startLine;
            comment.endLine = validation.newPosition.endLine;
          }

          // Update comment status
          comment.status = validation.status;
          validComments.push(comment);
        }
        // Note: Outdated comments are not included but could be shown separately
      }
    }

    return validComments;
  }

  // Get ALL comments including outdated ones (for debugging/review)
  getAllCommentsWithStatus(fileDiffs: FileDiff[]): Array<Comment & { validationInfo: any }> {
    const allComments = this.getAllComments();
    const commentsWithStatus: Array<Comment & { validationInfo: any }> = [];

    const fileDiffMap = new Map(fileDiffs.map(diff => [diff.filePath, diff]));

    for (const comment of allComments) {
      const fileDiff = fileDiffMap.get(comment.filePath);
      if (fileDiff) {
        const validation = this.validateAndRepositionComment(comment, fileDiff);
        commentsWithStatus.push({
          ...comment,
          validationInfo: validation,
        });
      } else {
        commentsWithStatus.push({
          ...comment,
          validationInfo: {
            isValid: false,
            status: 'outdated',
            reason: 'File not in current diff',
          },
        });
      }
    }

    return commentsWithStatus;
  }

  private hashString(content: string): string {
    // Normalize line endings to prevent CRLF/LF issues
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Use full SHA256 hash to avoid collisions - storage is cheap, data integrity is critical
    // Include content length as additional validation
    const contentWithLength = `${normalizedContent.length}:${normalizedContent}`;
    return crypto.createHash('sha256').update(contentWithLength, 'utf8').digest('hex');
  }

  addComment(comment: Comment): void {
    const comments = this.getAllComments();
    comments.push(comment);
    this.saveComments(comments);
  }

  updateComment(id: string, newText: string): void {
    const comments = this.getAllComments();
    const comment = comments.find(c => c.id === id);
    if (comment) {
      comment.text = newText;
      comment.timestamp = new Date().toISOString();
      this.saveComments(comments);
    }
  }

  deleteComment(id: string): void {
    const comments = this.getAllComments();
    const filteredComments = comments.filter(c => c && c.id !== id);
    this.saveComments(filteredComments);
  }

  deleteCommentByLocation(filePath: string, startLine: number, endLine: number): void {
    const comments = this.getAllComments();
    const filteredComments = comments.filter(
      c =>
        c && // Ensure comment is not null/undefined
        c.filePath && // Ensure filePath exists
        !(c.filePath === filePath && c.startLine === startLine && c.endLine === endLine)
    );
    this.saveComments(filteredComments);
  }

  getAllComments(): Comment[] {
    const stored = this.context.globalState.get<Comment[]>(CommentStorage.STORAGE_KEY);
    // Filter out any null/undefined comments and comments without required fields
    const validComments = (stored || []).filter(
      c => c && c.filePath && c.text && typeof c.startLine === 'number'
    );

    // Handle legacy comments that don't have the new anchor structure
    return validComments.map(comment => {
      if (!comment.anchor) {
        // Convert legacy comment to new format - these will be marked as outdated
        return {
          ...comment,
          anchor: {
            baseBranch:
              (comment as any).diffContext?.baseBranch || (comment as any).baseBranch || 'legacy',
            currentBranch:
              (comment as any).diffContext?.currentBranch ||
              (comment as any).currentBranch ||
              'legacy',
            lineContent: comment.codeSnippet || '',
            contextLines: {
              before: [],
              after: [],
            },
            originalLineNumbers: {
              start: comment.startLine,
              end: comment.endLine,
            },
          },
          status: 'outdated' as const,
        };
      }
      return comment;
    });
  }

  getCommentsForFile(filePath: string): Comment[] {
    return this.getAllComments().filter(comment => comment.filePath === filePath);
  }

  // Get valid comments for a specific file in the current diff
  getValidCommentsForFile(filePath: string, fileDiff: FileDiff): Comment[] {
    const allComments = this.getAllComments().filter(comment => comment.filePath === filePath);
    return allComments.filter(comment => {
      const validation = this.validateAndRepositionComment(comment, fileDiff);
      return validation.isValid;
    });
  }

  getCommentsForLine(filePath: string, lineNumber: number): Comment[] {
    return this.getAllComments().filter(
      comment =>
        comment.filePath === filePath &&
        lineNumber >= comment.startLine &&
        lineNumber <= comment.endLine
    );
  }

  clearAllComments(): void {
    this.saveComments([]);
  }

  getCommentCount(): number {
    return this.getAllComments().length;
  }

  private saveComments(comments: Comment[]): void {
    this.context.globalState.update(CommentStorage.STORAGE_KEY, comments);
  }

  // Export comments for external use (e.g., copying to clipboard)
  exportComments(): string {
    const comments = this.getAllComments();

    if (comments.length === 0) {
      return 'No comments available.';
    }

    let output = '# Branch Review Comments\n\n';

    // Group comments by file
    const commentsByFile = new Map<string, Comment[]>();
    comments.forEach(comment => {
      if (!commentsByFile.has(comment.filePath)) {
        commentsByFile.set(comment.filePath, []);
      }
      commentsByFile.get(comment.filePath)!.push(comment);
    });

    // Sort files alphabetically
    const sortedFiles = Array.from(commentsByFile.keys()).sort();

    sortedFiles.forEach(filePath => {
      output += `## ${filePath}\n\n`;

      const fileComments = commentsByFile.get(filePath)!;
      // Sort comments by line number
      fileComments.sort((a, b) => a.startLine - b.startLine);

      fileComments.forEach((comment, index) => {
        output += `### Comment ${index + 1}\n`;
        output += `**Lines ${comment.startLine}`;
        if (comment.startLine !== comment.endLine) {
          output += `-${comment.endLine}`;
        }
        output += `:**\n\n`;

        if (
          comment.codeSnippet &&
          comment.codeSnippet !== `Lines ${comment.startLine}-${comment.endLine}`
        ) {
          output += '```\n';
          output += comment.codeSnippet;
          output += '\n```\n\n';
        }

        output += `**Review Comment:**\n${comment.text}\n\n`;
        output += `*Added: ${new Date(comment.timestamp).toLocaleString()}*\n\n`;
        output += '---\n\n';
      });
    });

    return output;
  }

  // Import comments from external source (for future use)
  importComments(commentsData: string): boolean {
    try {
      const comments = JSON.parse(commentsData) as Comment[];
      if (Array.isArray(comments)) {
        this.saveComments(comments);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  // Get statistics about comments
  getCommentStats(): {
    totalComments: number;
    filesWithComments: number;
    averageCommentsPerFile: number;
    oldestComment: string | null;
    newestComment: string | null;
  } {
    const comments = this.getAllComments();

    if (comments.length === 0) {
      return {
        totalComments: 0,
        filesWithComments: 0,
        averageCommentsPerFile: 0,
        oldestComment: null,
        newestComment: null,
      };
    }

    const uniqueFiles = new Set(comments.map(c => c.filePath));
    const timestamps = comments.map(c => c.timestamp).sort();

    return {
      totalComments: comments.length,
      filesWithComments: uniqueFiles.size,
      averageCommentsPerFile: Math.round((comments.length / uniqueFiles.size) * 100) / 100,
      oldestComment: timestamps[0],
      newestComment: timestamps[timestamps.length - 1],
    };
  }
}
