import * as vscode from 'vscode';
import { GitService, FileDiff } from './gitService';
import { ReviewPanel } from './reviewPanel';
import { CommentStorage } from './commentStorage';

import { COMMANDS, DEFAULT_CONFIG, TEMP_FILE_PATTERNS } from './constants';

export function activate(context: vscode.ExtensionContext) {
  try {
    const gitService = new GitService();
    const commentStorage = new CommentStorage(context);
    let currentReviewPanel: ReviewPanel | undefined;

    // Register command to start branch review
    let startReviewCommand = vscode.commands.registerCommand(COMMANDS.START_REVIEW, async () => {
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage('No workspace folder found');
          return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        // Check if we're in a git repository
        const isGitRepo = await gitService.isGitRepository(workspaceRoot);
        if (!isGitRepo) {
          vscode.window.showErrorMessage('Current workspace is not a git repository');
          return;
        }

        // Do minimal checks first, then show panel immediately
        const currentBranch = await gitService.getCurrentBranch(workspaceRoot);

        // Create and show review panel immediately with loading state
        currentReviewPanel = new ReviewPanel(context, gitService, commentStorage, workspaceRoot);

        // Show panel immediately, then do heavy operations in background
        await currentReviewPanel.showReviewWithLoading(currentBranch);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to start branch review: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Register command to copy review summary to clipboard
    let submitCommentsCommand = vscode.commands.registerCommand(
      COMMANDS.SUBMIT_COMMENTS,
      async () => {
        try {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
          }
          const workspaceRoot = workspaceFolders[0].uri.fsPath;

          if (!currentReviewPanel) {
            vscode.window.showInformationMessage(
              'No active review panel. Please start a branch review first.'
            );
            return;
          }

          // Get current branch context for display
          const currentBranch = await gitService.getCurrentBranch(workspaceRoot);
          const baseBranch =
            currentReviewPanel.getCurrentBaseBranch() ||
            (await gitService.getMainBranch(workspaceRoot));

          // Get current diff to ensure we're working with the latest state
          let currentDiff = null;
          try {
            currentDiff = await gitService.getDiffWithBranch(workspaceRoot, baseBranch);
          } catch (error) {
            vscode.window.showErrorMessage(
              'Failed to get current diff. Please refresh the review.'
            );
            return;
          }

          // Get only valid comments for the current diff state (exactly what user sees)
          const validComments = commentStorage.getValidCommentsForDiff(currentDiff);

          if (validComments.length === 0) {
            vscode.window.showInformationMessage(
              `No valid comments to submit for comparison ${currentBranch}...${baseBranch}`
            );
            return;
          }

          const reviewSummary = await generateReviewSummary(validComments, currentDiff);
          await copyReviewToClipboard(reviewSummary);

          // Automatically clear only the submitted comments (WYSIWYG principle)
          validComments.forEach(comment => {
            commentStorage.deleteComment(comment.id);
          });

          vscode.window.showInformationMessage(
            `Submitted and cleared ${validComments.length} comments for ${currentBranch}...${baseBranch}`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to submit comments: ${error}`);
        }
      }
    );

    // Register command to clear all comments
    let clearCommentsCommand = vscode.commands.registerCommand(
      COMMANDS.CLEAR_COMMENTS,
      async () => {
        const totalComments = commentStorage.getAllComments().length;
        const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
          placeHolder: `Are you sure you want to clear ALL ${totalComments} comments globally? (This includes comments from all branch comparisons)`,
        });

        if (confirm === 'Yes') {
          commentStorage.clearAllComments();
          vscode.window.showInformationMessage(`Cleared all ${totalComments} comments globally`);
        }
      }
    );

    // Register command to show comment validation details
    let showCommentDebugCommand = vscode.commands.registerCommand(
      'branchReview.showCommentDebug',
      async () => {
        if (!currentReviewPanel) {
          vscode.window.showInformationMessage('No active review panel');
          return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;
        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        try {
          const currentBranch = await gitService.getCurrentBranch(workspaceRoot);
          const baseBranch =
            currentReviewPanel.getCurrentBaseBranch() ||
            (await gitService.getMainBranch(workspaceRoot));
          const currentDiff = await gitService.getDiffWithBranch(workspaceRoot, baseBranch);

          const allComments = commentStorage.getAllComments();
          let debugInfo = `Comment Debug Info (${allComments.length} total comments):\n\n`;

          const fileDiffMap = new Map(currentDiff.map(diff => [diff.filePath, diff]));

          const commentsWithStatus = commentStorage.getAllCommentsWithStatus(currentDiff);

          for (const comment of commentsWithStatus) {
            const validation = comment.validationInfo;
            debugInfo += `📝 ${comment.filePath}:${comment.startLine}-${comment.endLine}\n`;
            debugInfo += `   Status: ${validation.isValid ? '✅ VALID' : '❌ HIDDEN'} (${validation.status})\n`;
            debugInfo += `   Reason: ${validation.reason}\n`;
            if (validation.newPosition) {
              debugInfo += `   Repositioned: ${comment.startLine}-${comment.endLine} → ${validation.newPosition.startLine}-${validation.newPosition.endLine}\n`;
            }
            debugInfo += `   Text: "${comment.text.substring(0, 50)}..."\n\n`;
          }

          const doc = await vscode.workspace.openTextDocument({
            content: debugInfo,
            language: 'plaintext',
          });
          await vscode.window.showTextDocument(doc);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to generate debug info: ${error}`);
        }
      }
    );

    // Register debug command for development
    let debugCommentsCommand = vscode.commands.registerCommand(
      COMMANDS.DEBUG_COMMENTS,
      async () => {
        try {
          const comments = commentStorage.getAllComments();

          let message;
          if (comments.length > 0) {
            try {
              const commentsJson = JSON.stringify(comments, null, 2);
              message = `Found ${comments.length} comments:\n${commentsJson}`;
            } catch (jsonError) {
              message = `Found ${comments.length} comments but could not serialize them: ${jsonError}`;
            }
          } else {
            message = 'No comments found';
          }

          await vscode.window.showInformationMessage(message);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Debug command failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Register simple test command
    let testSimpleCommand = vscode.commands.registerCommand(COMMANDS.TEST_SIMPLE, () => {
      vscode.window.showInformationMessage('Simple test command works!');
    });

    context.subscriptions.push(
      startReviewCommand,
      submitCommentsCommand,
      clearCommentsCommand,
      showCommentDebugCommand,
      debugCommentsCommand,
      testSimpleCommand
    );
  } catch (error) {
    throw error;
  }
}

async function generateReviewSummary(
  comments: any[],
  currentDiff: FileDiff[] | null = null
): Promise<string> {
  if (comments.length === 0) {
    return 'No review comments to submit.';
  }

  // Simple filter - only exclude obvious temp/system files, keep all user comments
  const validComments = comments.filter((comment: any) => {
    const filePath = comment.filePath;

    // Only skip obvious temp/system files
    return !TEMP_FILE_PATTERNS.some(pattern => filePath.includes(pattern));
  });

  if (validComments.length === 0) {
    return 'No valid review comments to submit.';
  }

  // Get prompt configuration from VS Code settings
  const config = vscode.workspace.getConfiguration('branchReview.prompt');
  const header = config.get<string>('header') || DEFAULT_CONFIG.PROMPT_HEADER;
  const footer = config.get<string>('footer') || DEFAULT_CONFIG.PROMPT_FOOTER;

  let summary = header + '\n\n';

  // Group comments by file
  const commentsByFile = new Map<string, any[]>();
  validComments.forEach((comment: any) => {
    if (!commentsByFile.has(comment.filePath)) {
      commentsByFile.set(comment.filePath, []);
    }
    commentsByFile.get(comment.filePath)!.push(comment);
  });

  // Sort files alphabetically
  const sortedFiles = Array.from(commentsByFile.keys()).sort();

  sortedFiles.forEach((filePath, fileIndex) => {
    summary += `## ${fileIndex + 1}. \`${filePath}\`\n\n`;

    const fileComments = commentsByFile.get(filePath)!;
    // Sort comments by line number
    fileComments.sort((a, b) => a.startLine - b.startLine);

    fileComments.forEach((comment, commentIndex) => {
      summary += `### Issue ${commentIndex + 1} (Lines ${comment.startLine}`;
      if (comment.startLine !== comment.endLine) {
        summary += `-${comment.endLine}`;
      }
      summary += ')\n\n';

      summary += `**Feedback:** ${comment.text}\n\n`;

      if (
        comment.codeSnippet &&
        comment.codeSnippet !== `Lines ${comment.startLine}-${comment.endLine}`
      ) {
        summary += '**Code Reference:**\n';
        summary += '```\n';
        summary += comment.codeSnippet;
        summary += '\n```\n\n';
      }
    });
  });

  // Add footer
  summary += '\n' + footer;

  return summary;
}

async function copyReviewToClipboard(reviewSummary: string) {
  // Copy to clipboard
  await vscode.env.clipboard.writeText(reviewSummary);

  try {
    // Try to open and focus chat automatically
    const chatCommands = [
      'aichat.newchataction', // Open Chat
      'aichat.newfollowupaction', // Focus chat input
      'workbench.panel.chat.view.copilot.focus', // Focus chat panel
      'composer.openChatAsEditor', // Open chat as editor
    ];

    let chatOpened = false;
    for (const command of chatCommands) {
      try {
        await vscode.commands.executeCommand(command);
        chatOpened = true;
        break;
      } catch (error) {
        // Try next command
      }
    }

    if (chatOpened) {
      // Wait for chat to focus, then auto-paste
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        vscode.window.showInformationMessage('✅ Review submitted to chat!');
        return;
      } catch (pasteError) {
        // Fall back to manual paste instruction
      }
    }
  } catch (error) {
    // Fall back to original behavior
  }

  // Fallback: Show simple message
  vscode.window.showInformationMessage('📋 Review copied to clipboard - paste in chat!');
}

export function deactivate() {}
