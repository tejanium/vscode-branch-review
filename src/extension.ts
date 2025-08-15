import * as vscode from 'vscode';
import { GitService, CommentStorage } from './services';
import { ReviewPanel } from './ui';
import {
  createStartReviewCommand,
  createSubmitCommentsCommand,
  createClearCommentsCommand,
} from './commands';

export async function activate(context: vscode.ExtensionContext) {
  try {
    // Initialize core services
    const gitService = new GitService();
    const commentStorage = new CommentStorage(context);
    let currentReviewPanel: ReviewPanel | undefined;

    // Helper functions for command access to shared state
    const getCurrentReviewPanel = () => currentReviewPanel;
    const setCurrentReviewPanel = (panel: ReviewPanel | undefined) => {
      currentReviewPanel = panel;
    };

    // Register all commands
    const startReviewCommand = await createStartReviewCommand(
      context,
      gitService,
      commentStorage,
      getCurrentReviewPanel,
      setCurrentReviewPanel
    );

    const submitCommentsCommand = await createSubmitCommentsCommand(
      gitService,
      commentStorage,
      getCurrentReviewPanel
    );

    const clearCommentsCommand = await createClearCommentsCommand(commentStorage);

    // Add all commands to subscriptions
    context.subscriptions.push(startReviewCommand, submitCommentsCommand, clearCommentsCommand);
  } catch (error) {
    throw error;
  }
}

export function deactivate() {}
