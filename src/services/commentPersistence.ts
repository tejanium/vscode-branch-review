import * as vscode from 'vscode';
import { STORAGE_KEYS } from '../constants';
import { Comment } from './commentStorage';

/**
 * Handles comment persistence and basic CRUD operations
 */
export class CommentPersistence {
  private static readonly STORAGE_KEY = STORAGE_KEYS.COMMENTS;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Get all comments from storage
   */
  getAllComments(): Comment[] {
    const stored = this.context.globalState.get<Comment[]>(CommentPersistence.STORAGE_KEY);
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

  /**
   * Get comments for a specific file
   */
  getCommentsForFile(filePath: string): Comment[] {
    return this.getAllComments().filter(comment => comment.filePath === filePath);
  }

  /**
   * Add a new comment
   */
  addComment(comment: Comment): void {
    const comments = this.getAllComments();
    comments.push(comment);
    this.saveComments(comments);
  }

  /**
   * Update an existing comment's text
   */
  updateComment(commentId: string, newText: string): void {
    const comments = this.getAllComments();
    const comment = comments.find(c => c.id === commentId);
    if (comment) {
      comment.text = newText;
      comment.timestamp = new Date().toISOString();
      this.saveComments(comments);
    }
  }

  /**
   * Delete a comment by ID
   */
  deleteComment(commentId: string): void {
    const comments = this.getAllComments();
    const filteredComments = comments.filter(c => c.id !== commentId);
    this.saveComments(filteredComments);
  }

  /**
   * Delete a comment by location (fallback method)
   */
  deleteCommentByLocation(filePath: string, startLine: number, endLine: number): void {
    const comments = this.getAllComments();
    const filteredComments = comments.filter(
      c => !(c.filePath === filePath && c.startLine === startLine && c.endLine === endLine)
    );
    this.saveComments(filteredComments);
  }

  /**
   * Clear all comments
   */
  clearAllComments(): void {
    this.saveComments([]);
  }

  /**
   * Save comments to storage
   */
  private saveComments(comments: Comment[]): void {
    this.context.globalState.update(CommentPersistence.STORAGE_KEY, comments);
  }
}
