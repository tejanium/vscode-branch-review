import * as vscode from "vscode";
import { GitService, FileDiff } from "./gitService";
import { ReviewPanel } from "./reviewPanel";
import { CommentStorage } from "./commentStorage";

import { COMMANDS, DEFAULT_CONFIG, TEMP_FILE_PATTERNS } from "./constants";

export function activate(context: vscode.ExtensionContext) {
  const gitService = new GitService();
  const commentStorage = new CommentStorage(context);
  let currentReviewPanel: ReviewPanel | undefined;

  // Register command to start branch review
  let startReviewCommand = vscode.commands.registerCommand(
    COMMANDS.START_REVIEW,
    async () => {
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        // Check if we're in a git repository
        const isGitRepo = await gitService.isGitRepository(workspaceRoot);
        if (!isGitRepo) {
          vscode.window.showErrorMessage(
            "Current workspace is not a git repository"
          );
          return;
        }

        // Do minimal checks first, then show panel immediately
        const currentBranch = await gitService.getCurrentBranch(workspaceRoot);

        // Create and show review panel immediately with loading state
        currentReviewPanel = new ReviewPanel(
          context,
          gitService,
          commentStorage,
          workspaceRoot
        );

        // Show panel immediately, then do heavy operations in background
        await currentReviewPanel.showReviewWithLoading(currentBranch);
      } catch (error) {
        console.error("Error starting branch review:", error);
        vscode.window.showErrorMessage(
          `Failed to start branch review: ${error}`
        );
      }
    }
  );

  // Register command to copy review summary to clipboard
  let submitCommentsCommand = vscode.commands.registerCommand(
    COMMANDS.SUBMIT_COMMENTS,
    async () => {
      try {
        const comments = commentStorage.getAllComments();

        if (comments.length === 0) {
          vscode.window.showInformationMessage("No comments to submit");
          return;
        }

        // Get current diff to validate comments against
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }
        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        let currentDiff = null;
        try {
          currentDiff = await gitService.getDiffWithMain(workspaceRoot);
        } catch (error) {
          // Silently continue without diff validation
        }

        const reviewSummary = await generateReviewSummary(
          comments,
          currentDiff
        );
        await copyReviewToClipboard(reviewSummary);

        // Auto-clear comments after submission
        commentStorage.clearAllComments();
      } catch (error) {
        console.error("Error submitting comments:", error);
        vscode.window.showErrorMessage(`Failed to submit comments: ${error}`);
      }
    }
  );

  // Register command to clear all comments
  let clearCommentsCommand = vscode.commands.registerCommand(
    COMMANDS.CLEAR_COMMENTS,
    async () => {
      const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
        placeHolder: "Are you sure you want to clear all comments?",
      });

      if (confirm === "Yes") {
        commentStorage.clearAllComments();
        vscode.window.showInformationMessage("All comments cleared");
      }
    }
  );

  context.subscriptions.push(
    startReviewCommand,
    submitCommentsCommand,
    clearCommentsCommand
  );
}

async function generateReviewSummary(
  comments: any[],
  currentDiff: FileDiff[] | null = null
): Promise<string> {
  if (comments.length === 0) {
    return "No review comments to submit.";
  }

  // Simple filter - only exclude obvious temp/system files, keep all user comments
  const validComments = comments.filter((comment: any) => {
    const filePath = comment.filePath;

    // Only skip obvious temp/system files
    return !TEMP_FILE_PATTERNS.some((pattern) => filePath.includes(pattern));
  });

  if (validComments.length === 0) {
    return "No valid review comments to submit.";
  }

  // Get prompt configuration from VS Code settings
  const config = vscode.workspace.getConfiguration("branchReview.prompt");
  const header = config.get<string>("header") || DEFAULT_CONFIG.PROMPT_HEADER;
  const footer = config.get<string>("footer") || DEFAULT_CONFIG.PROMPT_FOOTER;

  let summary = header + "\n\n";

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
      summary += ")\n\n";

      summary += `**Feedback:** ${comment.text}\n\n`;

      if (
        comment.codeSnippet &&
        comment.codeSnippet !== `Lines ${comment.startLine}-${comment.endLine}`
      ) {
        summary += "**Code Reference:**\n";
        summary += "```\n";
        summary += comment.codeSnippet;
        summary += "\n```\n\n";
      }
    });
  });

  // Add footer
  summary += "\n" + footer;

  return summary;
}

async function copyReviewToClipboard(reviewSummary: string) {
  // Copy to clipboard
  await vscode.env.clipboard.writeText(reviewSummary);

  try {
    // Try to open and focus chat automatically
    const chatCommands = [
      "aichat.newchataction", // Open Chat
      "aichat.newfollowupaction", // Focus chat input
      "workbench.panel.chat.view.copilot.focus", // Focus chat panel
      "composer.openChatAsEditor", // Open chat as editor
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
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        await vscode.commands.executeCommand(
          "editor.action.clipboardPasteAction"
        );
        vscode.window.showInformationMessage("✅ Review submitted to chat!");
        return;
      } catch (pasteError) {
        // Fall back to manual paste instruction
      }
    }
  } catch (error) {
    // Fall back to original behavior
  }

  // Fallback: Show simple message
  vscode.window.showInformationMessage(
    "📋 Review copied to clipboard - paste in chat!"
  );
}

export function deactivate() {}
