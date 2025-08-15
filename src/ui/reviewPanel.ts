import * as vscode from 'vscode';
import { GitService, FileDiff } from '../services/gitService';
import { CommentStorage, Comment } from '../services/commentStorage';
import { WEBVIEW_COMMANDS } from '../constants';
import { WebviewRenderer, WebviewData } from './webviewRenderer';
import { ReviewModeManager } from './reviewModeManager';
import { MessageHandler } from './messageHandler';
import * as Prism from 'prismjs';

// Import all PrismJS language components (298+ languages)
// Using the official loader function with no arguments loads ALL languages
const loadLanguages = require('prismjs/components/');
loadLanguages(); // Load all 298+ languages

export class ReviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private modeManager: ReviewModeManager;
  private messageHandler: MessageHandler;
  private renderer: WebviewRenderer | undefined;
  private currentDiff: FileDiff[] = [];
  private currentWarningMessage: string | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private gitService: GitService,
    private commentStorage: CommentStorage,
    private workspaceRoot: string
  ) {
    this.modeManager = new ReviewModeManager(gitService, workspaceRoot);
    this.messageHandler = new MessageHandler(
      gitService,
      commentStorage,
      this,
      this.modeManager,
      workspaceRoot,
      diff => this.updateCurrentDiff(diff),
      (currentBranch, baseBranch, diff) => this.loadReviewContent(currentBranch, baseBranch, diff),
      () => this.currentDiff
    );
  }

  getCurrentBaseBranch(): string {
    return this.modeManager.getCurrentBaseBranch();
  }

  getCurrentReviewMode(): 'branch-compare' | 'working-changes' {
    return this.modeManager.getCurrentMode();
  }

  // Panel management methods (merged from PanelManager)
  createPanel(): vscode.WebviewPanel {
    if (this.panel) {
      this.panel.dispose();
    }

    this.panel = vscode.window.createWebviewPanel(
      'branchReview',
      'Branch Review',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview')],
      }
    );

    return this.panel;
  }

  getPanel(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
  }

  postMessage(message: any): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  showError(message: string): void {
    this.postMessage({
      command: WEBVIEW_COMMANDS.SHOW_ERROR,
      message,
    });
  }

  showWarning(message: string): void {
    this.currentWarningMessage = message;
    this.postMessage({
      command: WEBVIEW_COMMANDS.SHOW_WARNING,
      message,
    });
  }

  hideWarning(): void {
    this.currentWarningMessage = undefined;
  }

  updateLoadingStatus(message: string): void {
    this.postMessage({
      command: WEBVIEW_COMMANDS.UPDATE_LOADING_STATUS,
      message,
    });
  }

  hideLoading(): void {
    this.postMessage({
      command: WEBVIEW_COMMANDS.HIDE_LOADING,
    });
  }

  async showReview(currentBranch: string, baseBranch: string, diff: FileDiff[]) {
    this.currentDiff = diff;
    this.modeManager.setBaseBranch(baseBranch);

    // Show panel with loading state immediately
    this.showLoadingPanel(currentBranch, baseBranch);

    // Then load the actual content
    await this.loadReviewContent(currentBranch, baseBranch, diff);
  }

  async showReviewWithLoading(currentBranch: string) {
    // Show loading panel immediately with minimal info
    this.showLoadingPanel(currentBranch, 'main');

    try {
      // Determine the appropriate mode and get initial diff
      this.updateLoadingStatus('Detecting main branch...');
      const result = await this.modeManager.determineInitialMode(currentBranch);

      if (result.shouldShowError) {
        this.showError(result.shouldShowError);
        return;
      }

      if (result.shouldShowWarning) {
        this.showWarning(result.shouldShowWarning);
      }

      // Set the diff for later use
      this.currentDiff = result.diff;

      // Load the full content
      await this.loadReviewContent(currentBranch, result.baseBranch, result.diff);
    } catch (error) {
      this.showError(`Failed to load review: ${error}`);
    }
  }

  private showLoadingPanel(currentBranch: string, baseBranch: string) {
    const panel = this.createPanel();

    // Set up message handling
    panel.webview.onDidReceiveMessage(
      async message => {
        await this.messageHandler.handleMessage(message);
      },
      undefined,
      this.context.subscriptions
    );

    // Set loading HTML
    panel.webview.html = this.getLoadingHtml(currentBranch, baseBranch);
  }

  private async loadReviewContent(currentBranch: string, baseBranch: string, diff: FileDiff[]) {
    try {
      this.updateLoadingStatus('Rendering diff...');

      // Get all branches for branch selector
      const allBranches = await this.gitService.getAllBranches(this.workspaceRoot);

      // Calculate diff stats
      const diffStats = this.calculateDiffStats(diff);

      // Prepare webview data
      const webviewData: WebviewData = {
        diff,
        currentBranch,
        baseBranch,
        allBranches,
        reviewMode: this.modeManager.getCurrentMode(),
        diffStats,
        warningMessage: this.currentWarningMessage,
      };

      // Render the content
      const panel = this.getPanel();
      if (panel) {
        // Initialize renderer if needed
        if (!this.renderer) {
          this.renderer = new WebviewRenderer(panel, this.context);
        }
        panel.webview.html = this.renderer.render(webviewData);
      }

      // Load comments after rendering
      await this.loadComments();

      this.hideLoading();
    } catch (error) {
      this.showError(`Failed to load review content: ${error}`);
    }
  }

  private async loadComments() {
    const comments = this.commentStorage.getValidCommentsForDiff(this.currentDiff);
    this.postMessage({
      command: WEBVIEW_COMMANDS.COMMENTS_UPDATED,
      comments,
    });
  }

  private updateCurrentDiff(diff: FileDiff[]) {
    this.currentDiff = diff;
  }

  private calculateDiffStats(diff: FileDiff[]): { added: number; removed: number } {
    let added = 0;
    let removed = 0;

    diff.forEach(fileDiff => {
      fileDiff.hunks.forEach(hunk => {
        hunk.lines.forEach(line => {
          if (line.type === 'added') added++;
          else if (line.type === 'removed') removed++;
        });
      });
    });

    return { added, removed };
  }

  private getLoadingHtml(currentBranch: string, baseBranch: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Branch Review</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .loading-container {
            text-align: center;
            max-width: 500px;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid var(--vscode-progressBar-background);
            border-top: 4px solid var(--vscode-progressBar-foreground);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .loading-title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .loading-subtitle {
            font-size: 16px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
          }
          .loading-status {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <div class="loading-title">Branch Review</div>
          <div class="loading-subtitle">Comparing ${currentBranch} with ${baseBranch}</div>
          <div class="loading-status" id="loading-status">Loading...</div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          // Listen for loading status updates
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'updateLoadingStatus':
                const statusElement = document.getElementById('loading-status');
                if (statusElement) {
                  statusElement.textContent = message.message;
                }
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
