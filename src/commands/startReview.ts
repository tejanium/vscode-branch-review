import * as vscode from 'vscode';
import { GitService } from '../services';
import { ReviewPanel } from '../ui/reviewPanel';
import { CommentStorage } from '../services';

export async function createStartReviewCommand(
  context: vscode.ExtensionContext,
  gitService: GitService,
  commentStorage: CommentStorage,
  getCurrentReviewPanel: () => ReviewPanel | undefined,
  setCurrentReviewPanel: (panel: ReviewPanel | undefined) => void
): Promise<vscode.Disposable> {
  return vscode.commands.registerCommand('branchReview.startReview', async () => {
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
      const reviewPanel = new ReviewPanel(context, gitService, commentStorage, workspaceRoot);
      setCurrentReviewPanel(reviewPanel);

      // Show panel immediately, then do heavy operations in background
      await reviewPanel.showReviewWithLoading(currentBranch);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to start branch review: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
