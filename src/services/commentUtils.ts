import * as crypto from 'crypto';
import { FileDiff } from './gitService';
import { Comment } from './commentStorage';

/**
 * Utility functions for comment operations
 */

/**
 * Generate anchor data for a comment with context
 */
export function createCommentAnchor(
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

/**
 * Hash a string for content comparison
 */
export function hashString(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Normalize content for comparison (remove extra whitespace, etc.)
 */
export function normalizeContent(content: string): string {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .toLowerCase();
}

/**
 * Advanced comment validation with smart repositioning
 */
export function validateAndRepositionComment(
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
    if (checkExactPosition(comment, currentLines)) {
      return {
        isValid: true,
        status: 'current',
        reason: 'Lines unchanged at original position',
        newPosition: { startLine: comment.startLine, endLine: comment.endLine },
      };
    }

    // Try to find the lines using surrounding context
    const repositionResult = findLinesWithContext(comment, currentLines);
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

/**
 * Check if comment lines exist at their original position
 */
function checkExactPosition(comment: Comment, currentLines: string[]): boolean {
  const { lineContent } = comment.anchor;
  const startIndex = comment.startLine - 1; // Convert to 0-based
  const endIndex = comment.endLine - 1;

  if (startIndex < 0 || endIndex >= currentLines.length) {
    return false;
  }

  const currentContent = currentLines.slice(startIndex, endIndex + 1).join('\n');
  const expectedContent = lineContent;

  // Compare with expected content (normalize whitespace)
  return normalizeContent(currentContent) === normalizeContent(expectedContent);
}

/**
 * Try to find comment lines using surrounding context
 */
function findLinesWithContext(
  comment: Comment,
  currentLines: string[]
): {
  found: boolean;
  startLine?: number;
  endLine?: number;
} {
  const { lineContent, contextLines } = comment.anchor;
  const targetLines = lineContent.split('\n');
  const targetLength = targetLines.length;

  const normalizedTarget = normalizeContent(lineContent);

  // Search through the file for the target lines with context
  for (let i = 0; i <= currentLines.length - targetLength; i++) {
    const candidateLines = currentLines.slice(i, i + targetLength);
    const candidateContent = candidateLines.join('\n');

    // Check if the content matches (with normalization)
    if (normalizeContent(candidateContent) === normalizedTarget) {
      // Verify context if available
      if (verifyContext(currentLines, i, i + targetLength - 1, contextLines)) {
        return {
          found: true,
          startLine: i + 1, // Convert to 1-based
          endLine: i + targetLength,
        };
      }
    }
  }

  return { found: false };
}

/**
 * Verify that the surrounding context matches
 */
function verifyContext(
  currentLines: string[],
  startIndex: number,
  endIndex: number,
  expectedContext: { before: string[]; after: string[] }
): boolean {
  // Check context before
  const beforeContext = expectedContext.before;
  if (beforeContext.length > 0) {
    const actualBefore = currentLines.slice(
      Math.max(0, startIndex - beforeContext.length),
      startIndex
    );

    // Allow partial context match (at least 50% of context lines should match)
    const matchingBefore = beforeContext.filter(
      (line, i) => actualBefore[i] && normalizeContent(line) === normalizeContent(actualBefore[i])
    ).length;

    if (matchingBefore / beforeContext.length < 0.5) {
      return false;
    }
  }

  // Check context after
  const afterContext = expectedContext.after;
  if (afterContext.length > 0) {
    const actualAfter = currentLines.slice(
      endIndex + 1,
      Math.min(currentLines.length, endIndex + 1 + afterContext.length)
    );

    // Allow partial context match (at least 50% of context lines should match)
    const matchingAfter = afterContext.filter(
      (line, i) => actualAfter[i] && normalizeContent(line) === normalizeContent(actualAfter[i])
    ).length;

    if (matchingAfter / afterContext.length < 0.5) {
      return false;
    }
  }

  return true;
}
