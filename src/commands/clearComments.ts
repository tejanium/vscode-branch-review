import * as vscode from 'vscode';
import { CommentStorage } from '../services';

export async function createClearCommentsCommand(
  commentStorage: CommentStorage
): Promise<vscode.Disposable> {
  return vscode.commands.registerCommand('branchReview.clearComments', async () => {
    const totalComments = commentStorage.getAllComments().length;
    const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: `Are you sure you want to clear ALL ${totalComments} comments globally? (This includes comments from all branch comparisons)`,
    });

    if (confirm === 'Yes') {
      commentStorage.clearAllComments();
      vscode.window.showInformationMessage(`Cleared all ${totalComments} comments globally`);
    }
  });
}
