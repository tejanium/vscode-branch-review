import * as vscode from 'vscode';
import { STORAGE_KEYS } from './constants';

export interface Comment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
  codeSnippet: string;
  timestamp: string;
}

export class CommentStorage {
  private static readonly STORAGE_KEY = STORAGE_KEYS.COMMENTS;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
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
    return (stored || []).filter(c => c && c.filePath && c.text && typeof c.startLine === 'number');
  }

  getCommentsForFile(filePath: string): Comment[] {
    return this.getAllComments().filter(comment => comment.filePath === filePath);
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
