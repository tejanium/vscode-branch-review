import * as vscode from 'vscode';
import { GitService, FileDiff } from '../services/gitService';
import { CommentStorage, Comment } from '../services/commentStorage';
import { WEBVIEW_COMMANDS } from '../constants';
import { ReviewModeManager } from './reviewModeManager';

interface PanelOperations {
  postMessage(message: any): void;
  showError(message: string): void;
  showWarning(message: string): void;
  hideWarning(): void;
  updateLoadingStatus(message: string): void;
  hideLoading(): void;
}

/**
 * Handles webview messages and coordinates responses
 */
export class MessageHandler {
  constructor(
    private gitService: GitService,
    private commentStorage: CommentStorage,
    private panelOperations: PanelOperations,
    private modeManager: ReviewModeManager,
    private workspaceRoot: string,
    private onDiffUpdate: (diff: FileDiff[]) => void,
    private onContentReload: (
      currentBranch: string,
      baseBranch: string,
      diff: FileDiff[]
    ) => Promise<void>,
    private getCurrentDiff: () => FileDiff[]
  ) {}

  async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case WEBVIEW_COMMANDS.ADD_COMMENT:
        await this.handleAddComment(message);
        break;

      case WEBVIEW_COMMANDS.UPDATE_COMMENT:
        await this.handleUpdateComment(message);
        break;

      case WEBVIEW_COMMANDS.DELETE_COMMENT:
        await this.handleDeleteComment(message);
        break;

      case WEBVIEW_COMMANDS.DELETE_ALL_COMMENTS:
        await this.handleDeleteAllComments();
        break;

      case WEBVIEW_COMMANDS.REFRESH_DIFF:
        await this.handleRefreshDiff();
        break;

      case WEBVIEW_COMMANDS.CHANGE_BRANCH:
        await this.handleChangeBranch(message);
        break;

      case WEBVIEW_COMMANDS.CHANGE_MODE:
        await this.handleChangeMode(message);
        break;

      case WEBVIEW_COMMANDS.OPEN_FILE:
        await this.handleOpenFile(message);
        break;

      default:
        console.warn('Unknown webview command:', message.command);
    }
  }

  private async handleAddComment(message: any): Promise<void> {
    const { filePath, startLine, endLine, text, codeSnippet } = message.data;

    // Find the relevant file diff
    const fileDiff = this.getCurrentFileDiff(filePath);
    if (!fileDiff) {
      this.panelOperations.showError(`Could not find diff for file: ${filePath}`);
      return;
    }

    const currentBranch = await this.gitService.getCurrentBranch(this.workspaceRoot);
    const baseBranch = this.modeManager.getCurrentBaseBranch();

    const comment: Comment = {
      id: this.generateCommentId(),
      filePath,
      startLine,
      endLine,
      text,
      codeSnippet,
      timestamp: new Date().toISOString(),
      anchor: this.commentStorage.createCommentAnchor(
        baseBranch,
        currentBranch,
        fileDiff,
        startLine,
        endLine
      ),
      status: 'current',
    };

    this.commentStorage.addComment(comment);
    await this.sendCommentsUpdate();
  }

  private async handleUpdateComment(message: any): Promise<void> {
    const { commentId, text } = message.data;
    this.commentStorage.updateComment(commentId, text);
    await this.sendCommentsUpdate();
  }

  private async handleDeleteComment(message: any): Promise<void> {
    const { commentId } = message.data;
    this.commentStorage.deleteComment(commentId);
    await this.sendCommentsUpdate();
  }

  private async handleDeleteAllComments(): Promise<void> {
    this.commentStorage.clearAllComments();
    await this.sendCommentsUpdate();
  }

  private async handleRefreshDiff(): Promise<void> {
    try {
      this.panelOperations.updateLoadingStatus('Refreshing diff...');

      // Clear any existing warnings before re-evaluating
      this.panelOperations.hideWarning();

      // Re-evaluate mode selection based on current uncommitted changes
      const currentBranch = await this.gitService.getCurrentBranch(this.workspaceRoot);
      const result = await this.modeManager.determineInitialMode(currentBranch);

      // Show warning if there's one (e.g., uncommitted changes detected)
      if (result.shouldShowWarning) {
        this.panelOperations.showWarning(result.shouldShowWarning);
      }

      // Show error if there's one
      if (result.shouldShowError) {
        this.panelOperations.showError(result.shouldShowError);
        this.panelOperations.hideLoading();
        return;
      }

      this.onDiffUpdate(result.diff);
      await this.onContentReload(currentBranch, result.baseBranch, result.diff);

      this.panelOperations.hideLoading();
    } catch (error) {
      this.panelOperations.showError(`Failed to refresh diff: ${error}`);
    }
  }

  private async handleChangeBranch(message: any): Promise<void> {
    try {
      const { baseBranch } = message.data;
      this.panelOperations.updateLoadingStatus(`Switching to compare with ${baseBranch}...`);

      const newDiff = await this.modeManager.switchBaseBranch(baseBranch);
      this.onDiffUpdate(newDiff);

      const currentBranch = await this.gitService.getCurrentBranch(this.workspaceRoot);
      await this.onContentReload(currentBranch, baseBranch, newDiff);

      this.panelOperations.hideLoading();
    } catch (error) {
      this.panelOperations.showError(`Failed to switch branch: ${error}`);
    }
  }

  private async handleChangeMode(message: any): Promise<void> {
    try {
      const { newMode } = message.data;
      this.panelOperations.updateLoadingStatus(`Switching to ${newMode} mode...`);

      // Handle warnings based on mode and uncommitted changes
      const hasUncommittedChanges = await this.gitService.hasUncommittedChanges(this.workspaceRoot);

      if (newMode === 'branch-compare' && hasUncommittedChanges) {
        // Show warning when switching to Branch Compare with uncommitted changes
        this.panelOperations.showWarning(
          'You have uncommitted changes. In Branch Compare mode, line numbers may not be accurate for comments on uncommitted changes, switch to Working Changes mode instead.'
        );
      } else {
        // Clear warning when switching to Working Changes or when no uncommitted changes
        this.panelOperations.hideWarning();
      }

      const newDiff = await this.modeManager.switchMode(newMode);
      this.onDiffUpdate(newDiff);

      const currentBranch = await this.gitService.getCurrentBranch(this.workspaceRoot);
      await this.onContentReload(currentBranch, this.modeManager.getCurrentBaseBranch(), newDiff);

      this.panelOperations.hideLoading();
    } catch (error) {
      this.panelOperations.showError(`Failed to switch mode: ${error}`);
    }
  }

  private async handleOpenFile(message: any): Promise<void> {
    try {
      const { filePath, lineNumber } = message;
      const fullPath = vscode.Uri.file(require('path').join(this.workspaceRoot, filePath));

      const document = await vscode.workspace.openTextDocument(fullPath);
      const editor = await vscode.window.showTextDocument(document);

      if (lineNumber && lineNumber > 0) {
        const position = new vscode.Position(lineNumber - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      }
    } catch (error) {
      this.panelOperations.showError(`Failed to open file: ${error}`);
    }
  }

  private async sendCommentsUpdate(): Promise<void> {
    const comments = this.commentStorage.getAllComments();
    this.panelOperations.postMessage({
      command: WEBVIEW_COMMANDS.COMMENTS_UPDATED,
      comments,
    });
  }

  private generateCommentId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  private getCurrentFileDiff(filePath: string): FileDiff | undefined {
    const currentDiff = this.getCurrentDiff();
    return currentDiff.find(diff => diff.filePath === filePath);
  }
}
