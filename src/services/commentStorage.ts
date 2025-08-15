import * as vscode from 'vscode';
import { FileDiff } from './gitService';
import { CommentPersistence } from './commentPersistence';
import { createCommentAnchor, validateAndRepositionComment } from './commentUtils';

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
  private persistence: CommentPersistence;

  constructor(context: vscode.ExtensionContext) {
    this.persistence = new CommentPersistence(context);
  }

  /**
   * Generate anchor data for a comment with context
   */
  createCommentAnchor(
    baseBranch: string,
    currentBranch: string,
    fileDiff: FileDiff,
    startLine: number,
    endLine: number
  ): Comment['anchor'] {
    return createCommentAnchor(baseBranch, currentBranch, fileDiff, startLine, endLine);
  }

  /**
   * Get all comments from storage
   */
  getAllComments(): Comment[] {
    return this.persistence.getAllComments();
  }

  /**
   * Get comments for a specific file
   */
  getCommentsForFile(filePath: string): Comment[] {
    return this.persistence.getCommentsForFile(filePath);
  }

  /**
   * Add a new comment
   */
  addComment(comment: Comment): void {
    this.persistence.addComment(comment);
  }

  /**
   * Update an existing comment's text
   */
  updateComment(commentId: string, newText: string): void {
    this.persistence.updateComment(commentId, newText);
  }

  /**
   * Delete a comment by ID
   */
  deleteComment(commentId: string): void {
    this.persistence.deleteComment(commentId);
  }

  /**
   * Delete a comment by location (fallback method)
   */
  deleteCommentByLocation(filePath: string, startLine: number, endLine: number): void {
    this.persistence.deleteCommentByLocation(filePath, startLine, endLine);
  }

  /**
   * Clear all comments
   */
  clearAllComments(): void {
    this.persistence.clearAllComments();
  }

  /**
   * Get all comments with their validation status for the current diff
   */
  getAllCommentsWithStatus(currentDiff: FileDiff[]): Array<
    Comment & {
      validationInfo: {
        isValid: boolean;
        newPosition?: { startLine: number; endLine: number };
        status: 'current' | 'outdated' | 'moved';
        reason: string;
      };
    }
  > {
    const allComments = this.getAllComments();
    const fileDiffMap = new Map(currentDiff.map(diff => [diff.filePath, diff]));

    return allComments.map(comment => {
      const fileDiff = fileDiffMap.get(comment.filePath);

      if (!fileDiff) {
        return {
          ...comment,
          validationInfo: {
            isValid: false,
            status: 'outdated' as const,
            reason: 'File not found in current diff',
          },
        };
      }

      const validationInfo = validateAndRepositionComment(comment, fileDiff);
      return {
        ...comment,
        validationInfo,
      };
    });
  }

  /**
   * Get only valid comments for the current diff (what user sees in UI)
   */
  getValidCommentsForDiff(currentDiff: FileDiff[]): Comment[] {
    const commentsWithStatus = this.getAllCommentsWithStatus(currentDiff);

    return commentsWithStatus
      .filter(comment => comment.validationInfo.isValid)
      .map(comment => {
        // If comment was moved, update its position
        if (comment.validationInfo.newPosition) {
          return {
            ...comment,
            startLine: comment.validationInfo.newPosition.startLine,
            endLine: comment.validationInfo.newPosition.endLine,
            status: comment.validationInfo.status,
          };
        }
        return comment;
      });
  }

  /**
   * Get comments for a specific file in the current diff
   */
  getValidCommentsForFile(filePath: string, currentDiff: FileDiff[]): Comment[] {
    return this.getValidCommentsForDiff(currentDiff).filter(
      comment => comment.filePath === filePath
    );
  }

  /**
   * Validate and reposition a single comment (used by tests)
   */
  validateAndRepositionComment(
    comment: Comment,
    currentFileDiff: FileDiff
  ): {
    isValid: boolean;
    newPosition?: { startLine: number; endLine: number };
    status: 'current' | 'outdated' | 'moved';
    reason: string;
  } {
    return validateAndRepositionComment(comment, currentFileDiff);
  }

  /**
   * Get comment validation info (used by tests)
   */
  getCommentValidationInfo(
    comment: Comment,
    fileDiff: FileDiff
  ): {
    valid: boolean;
    reason?: string;
  } {
    const result = validateAndRepositionComment(comment, fileDiff);
    return {
      valid: result.isValid,
      reason: result.reason,
    };
  }
}
