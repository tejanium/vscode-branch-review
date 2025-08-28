import * as vscode from 'vscode';
import { GitService, CommentStorage, FileDiff } from '../services';
import { ReviewPanel } from '../ui/reviewPanel';
import { DEFAULT_CONFIG, TEMP_FILE_PATTERNS } from '../constants';

export async function createSubmitCommentsCommand(
  gitService: GitService,
  commentStorage: CommentStorage,
  getCurrentReviewPanel: () => ReviewPanel | undefined
): Promise<vscode.Disposable> {
  return vscode.commands.registerCommand('branchReview.submitComments', async () => {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
      }
      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      const currentReviewPanel = getCurrentReviewPanel();
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
      const reviewMode = currentReviewPanel.getCurrentReviewMode();
      let currentDiff = null;
      try {
        if (reviewMode === 'working-changes') {
          currentDiff = await gitService.getDiffWithWorkingDirectory(workspaceRoot);
        } else {
          currentDiff = await gitService.getDiffWithBranch(workspaceRoot, baseBranch);
        }
      } catch (error) {
        vscode.window.showErrorMessage('Failed to get current diff. Please refresh the review.');
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

      const reviewSummary = await generateReviewSummary(validComments, currentDiff, reviewMode);
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
  });
}

async function generateReviewSummary(
  comments: any[],
  currentDiff: FileDiff[] | null = null,
  reviewMode: 'branch-compare' | 'working-changes' = 'branch-compare'
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

  // Get footer based on review mode - check mode-specific setting first, then general, then default
  let footer: string;
  if (reviewMode === 'working-changes') {
    footer =
      config.get<string>('footerWorkingChanges') || // Mode-specific setting
      config.get<string>('footer') || // General setting
      DEFAULT_CONFIG.PROMPT_FOOTER_WORKING_CHANGES; // Default for mode
  } else {
    footer =
      config.get<string>('footerBranchCompare') || // Mode-specific setting
      config.get<string>('footer') || // General setting
      DEFAULT_CONFIG.PROMPT_FOOTER; // Default for mode
  }

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
