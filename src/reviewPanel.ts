import * as vscode from 'vscode';
import * as path from 'path';
import { GitService, FileDiff } from './gitService';
import { CommentStorage, Comment } from './commentStorage';
import { WEBVIEW_COMMANDS } from './constants';
import { WebviewRenderer, WebviewData } from './webviewRenderer';
import * as Prism from 'prismjs';

// Import all PrismJS language components (298+ languages)
// Using the official loader function with no arguments loads ALL languages
const loadLanguages = require('prismjs/components/');
loadLanguages(); // Load all 298+ languages

export class ReviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private renderer: WebviewRenderer | undefined;
  private gitService: GitService;
  private commentStorage: CommentStorage;
  private workspaceRoot: string;
  private currentDiff: FileDiff[] = [];
  private currentBaseBranch: string = '';

  constructor(
    private context: vscode.ExtensionContext,
    gitService: GitService,
    commentStorage: CommentStorage,
    workspaceRoot: string
  ) {
    this.gitService = gitService;
    this.commentStorage = commentStorage;
    this.workspaceRoot = workspaceRoot;
  }

  getCurrentBaseBranch(): string {
    return this.currentBaseBranch;
  }

  async showReview(currentBranch: string, baseBranch: string, diff: FileDiff[]) {
    this.currentDiff = diff;

    // Show panel with loading state immediately
    this.showLoadingPanel(currentBranch, baseBranch);

    // Then load the actual content
    await this.loadReviewContent(currentBranch, baseBranch, diff);
  }

  async showReviewWithLoading(currentBranch: string) {
    // Show loading panel immediately with minimal info
    this.showLoadingPanel(currentBranch, 'main');

    try {
      // Do all the heavy Git operations in background
      this.updateLoadingStatus('Detecting main branch...');
      const mainBranch = await this.gitService.getMainBranch(this.workspaceRoot);

      // Store the initial base branch
      this.currentBaseBranch = mainBranch;

      // Check if on main branch
      if (currentBranch === mainBranch) {
        if (this.panel) {
          this.panel.webview.postMessage({
            command: WEBVIEW_COMMANDS.SHOW_ERROR,
            message: `You are already on the main branch (${mainBranch}). Please switch to a feature branch to start a review.`,
          });
        }
        return;
      }

      this.updateLoadingStatus('Calculating diff with main branch...');
      const diff = await this.gitService.getDiffWithMain(this.workspaceRoot);

      if (diff.length === 0) {
        if (this.panel) {
          this.panel.webview.postMessage({
            command: WEBVIEW_COMMANDS.SHOW_ERROR,
            message: 'No differences found between current branch and main branch',
          });
        }
        return;
      }

      // Set the diff for later use
      this.currentDiff = diff;

      // Now load the full content
      await this.loadReviewContent(currentBranch, mainBranch, diff);
    } catch (error) {
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'showError',
          message: `Failed to load review: ${error}`,
        });
      }
    }
  }

  private showLoadingPanel(currentBranch: string, baseBranch: string) {
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
        localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'out'))],
      }
    );

    this.renderer = new WebviewRenderer(this.panel, this.context);

    // Render loading state
    const loadingData: WebviewData = {
      currentBranch,
      baseBranch,
      diff: [],
      allBranches: [baseBranch],
      diffStats: { added: 0, removed: 0 },
      isLoading: true,
    };
    this.panel.webview.html = this.renderer.render(loadingData);

    this.panel.reveal(vscode.ViewColumn.One);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.renderer = undefined;
    });

    this.setupWebviewMessageHandling();
  }

  private async loadReviewContent(currentBranch: string, baseBranch: string, diff: FileDiff[]) {
    try {
      this.updateLoadingStatus('Fetching available branches...');
      const allBranches = await this.gitService.getAllBranches(this.workspaceRoot);

      this.updateLoadingStatus('Generating diff content...');

      if (this.panel && this.renderer) {
        const data: WebviewData = {
          currentBranch,
          baseBranch,
          diff,
          allBranches,
          diffStats: WebviewRenderer.calculateDiffStats(diff),
          isLoading: false,
        };

        this.panel.webview.html = this.renderer.render(data);

        setTimeout(() => {
          this.hideLoading();
          this.loadComments();
        }, 100);
      }
    } catch (error) {
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'showError',
          message: `Failed to load review: ${error}`,
        });
      }
    }
  }

  private updateLoadingStatus(message: string) {
    if (this.panel) {
      this.panel.webview.postMessage({
        command: WEBVIEW_COMMANDS.UPDATE_LOADING_STATUS,
        message: message,
      });
    }
  }

  private hideLoading() {
    if (this.panel) {
      this.panel.webview.postMessage({
        command: WEBVIEW_COMMANDS.HIDE_LOADING,
      });
    }
  }

  private setupWebviewMessageHandling() {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(
      async message => {
        await this.handleWebviewMessage(message);
      },
      undefined,
      this.context.subscriptions
    );
  }

  private async handleWebviewMessage(message: any) {
    switch (message.command) {
      case WEBVIEW_COMMANDS.ADD_COMMENT:
        // Add diff context to the comment before storing
        const currentBranch = await this.gitService.getCurrentBranch(this.workspaceRoot);
        const baseBranch =
          this.currentBaseBranch || (await this.gitService.getMainBranch(this.workspaceRoot));

        // Find the relevant file diff
        const fileDiff = this.currentDiff.find(diff => diff.filePath === message.data.filePath);
        if (!fileDiff) {
          vscode.window.showErrorMessage(`Could not find diff for file: ${message.data.filePath}`);
          break;
        }

        // Create anchor data for this comment (GitHub-style)
        const anchor = this.commentStorage.createCommentAnchor(
          baseBranch,
          currentBranch,
          fileDiff,
          message.data.startLine,
          message.data.endLine
        );

        const commentWithAnchor = {
          ...message.data,
          anchor,
          status: 'current' as const,
        };

        this.commentStorage.addComment(commentWithAnchor);
        await this.loadComments();
        break;
      case WEBVIEW_COMMANDS.UPDATE_COMMENT:
        // Find and update the comment by location
        const existingComments = this.commentStorage.getAllComments();
        const commentToUpdate = existingComments.find(
          c =>
            c.filePath === message.data.filePath &&
            c.startLine === message.data.startLine &&
            c.endLine === message.data.endLine
        );
        if (commentToUpdate) {
          this.commentStorage.updateComment(commentToUpdate.id, message.data.text);
          await this.loadComments();
        }
        break;
      case WEBVIEW_COMMANDS.DELETE_COMMENT:
        if (message.data.id) {
          // Delete by ID (new format)
          this.commentStorage.deleteComment(message.data.id);
        } else if (message.data.filePath && message.data.startLine && message.data.endLine) {
          // Delete by file path and line numbers (fallback)
          this.commentStorage.deleteCommentByLocation(
            message.data.filePath,
            message.data.startLine,
            message.data.endLine
          );
        }
        await this.loadComments();
        break;
      case WEBVIEW_COMMANDS.LOAD_COMMENTS:
        await this.loadComments();
        break;
      case WEBVIEW_COMMANDS.REFRESH_DIFF:
        await this.refreshCurrentView();
        break;
      case WEBVIEW_COMMANDS.CHANGE_BRANCH:
        await this.refreshCurrentView(message.data.baseBranch);
        break;
      case WEBVIEW_COMMANDS.SUBMIT_COMMENTS:
        vscode.commands.executeCommand('branchReview.submitComments');
        break;
      case WEBVIEW_COMMANDS.DELETE_ALL_COMMENTS:
        // Delete only valid comments for current diff state
        const validCommentsToDelete = this.commentStorage.getValidCommentsForDiff(this.currentDiff);

        validCommentsToDelete.forEach(comment => {
          this.commentStorage.deleteComment(comment.id);
        });

        await this.loadComments();
        break;
      case WEBVIEW_COMMANDS.OPEN_FILE:
        await this.openFile(message.filePath);
        break;
    }
  }

  private async openFile(filePath: string) {
    if (!filePath) {
      return;
    }

    try {
      // Resolve the full file path
      const fullPath = path.resolve(this.workspaceRoot, filePath);

      // Convert to VS Code URI
      const fileUri = vscode.Uri.file(fullPath);

      // Check if file exists and open it
      try {
        await vscode.workspace.fs.stat(fileUri);
        // File exists, open it
        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document, {
          preview: false, // Don't open in preview mode
          preserveFocus: false, // Focus the editor
        });
      } catch (statError) {
        // File doesn't exist, show error
        vscode.window.showErrorMessage(`File not found: ${filePath}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error opening file: ${filePath}`);
    }
  }

  private async loadComments() {
    if (this.panel) {
      // Get current branch context for display
      const currentBranch = await this.gitService.getCurrentBranch(this.workspaceRoot);
      const baseBranch =
        this.currentBaseBranch || (await this.gitService.getMainBranch(this.workspaceRoot));

      // Get only valid comments for the current diff state
      const allComments = this.commentStorage.getAllComments();
      const validComments = this.commentStorage.getValidCommentsForDiff(this.currentDiff);

      // Check if comments were invalidated due to content changes
      const invalidatedCount = allComments.length - validComments.length;
      if (invalidatedCount > 0) {
        vscode.window.showInformationMessage(
          `${invalidatedCount} comment(s) were hidden because the file content or commented lines have changed.`
        );
      }

      this.panel.webview.postMessage({
        command: WEBVIEW_COMMANDS.COMMENTS_UPDATED,
        comments: validComments,
        baseBranch,
        currentBranch,
      });
    }
  }

  private async refreshCurrentView(baseBranch?: string) {
    try {
      // Show loading state immediately when refreshing
      if (this.panel) {
        this.panel.webview.postMessage({
          command: WEBVIEW_COMMANDS.UPDATE_LOADING_STATUS,
          message: baseBranch
            ? `Switching to compare with ${baseBranch}...`
            : 'Refreshing branch review...',
        });
      }

      const currentBranch = await this.gitService.getCurrentBranch(this.workspaceRoot);
      const selectedBaseBranch =
        baseBranch ||
        this.currentBaseBranch ||
        (await this.gitService.getMainBranch(this.workspaceRoot));

      // Update the stored base branch
      this.currentBaseBranch = selectedBaseBranch;

      // Update loading status
      if (this.panel) {
        this.panel.webview.postMessage({
          command: WEBVIEW_COMMANDS.UPDATE_LOADING_STATUS,
          message: `Calculating diff with ${selectedBaseBranch}...`,
        });
      }

      const diff = await this.gitService.getDiffWithBranch(this.workspaceRoot, selectedBaseBranch);
      const allBranches = await this.gitService.getAllBranches(this.workspaceRoot);

      // Update the current diff and set diff session ID for comment storage
      this.currentDiff = diff;
      this.commentStorage.setDiffSessionId(selectedBaseBranch, currentBranch, diff);

      if (this.panel && this.renderer) {
        const diffStats = WebviewRenderer.calculateDiffStats(diff);
        const data: WebviewData = {
          currentBranch,
          baseBranch: selectedBaseBranch,
          diff,
          allBranches,
          diffStats,
          isLoading: false,
        };

        this.panel.webview.html = this.renderer.render(data);

        // Ensure diff stats are updated after HTML replacement
        setTimeout(() => {
          this.loadComments();
          // Send a message to explicitly update diff stats in case HTML replacement didn't work
          this.panel?.webview.postMessage({
            command: WEBVIEW_COMMANDS.UPDATE_DIFF_STATS,
            data: diffStats,
          });
        }, 100);
      }
    } catch (error) {
      // Hide loading and show error
      if (this.panel) {
        this.panel.webview.postMessage({
          command: WEBVIEW_COMMANDS.SHOW_ERROR,
          message: `Failed to refresh diff: ${error}`,
        });
      }
    }
  }

  // Add server-side syntax highlighting using PrismJS
  static addSyntaxHighlighting(content: string, filePath: string): string {
    // Get language from file extension
    const extension = path.extname(filePath).toLowerCase();
    let language = ReviewPanel.getLanguageFromExtension(extension);

    try {
      // Escape HTML first for security
      const escapedContent = ReviewPanel.escapeHtml(content);

      // If we have a supported language, apply Prism.js highlighting
      if (language && Prism.languages[language]) {
        const highlighted = Prism.highlight(content, Prism.languages[language], language);
        return highlighted;
      }

      // Fallback to escaped content without highlighting
      return escapedContent;
    } catch (error) {
      return ReviewPanel.escapeHtml(content);
    }
  }

  private static getLanguageFromExtension(extension: string): string | null {
    const LANGUAGE_MAP: { [key: string]: string } = {
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.py': 'python',
      '.rb': 'ruby',
      '.php': 'php',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'bash',
      '.fish': 'bash',
      '.ps1': 'powershell',
      '.html': 'html',
      '.htm': 'html',
      '.xml': 'xml',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.cfg': 'ini',
      '.conf': 'ini',
      '.sql': 'sql',
      '.md': 'markdown',
      '.markdown': 'markdown',
      '.tex': 'latex',
      '.r': 'r',
      '.R': 'r',
      '.m': 'matlab',
      '.pl': 'perl',
      '.lua': 'lua',
      '.vim': 'vim',
      '.dockerfile': 'docker',
      '.Dockerfile': 'docker',
      '.makefile': 'makefile',
      '.Makefile': 'makefile',
    };
    return LANGUAGE_MAP[extension] || null;
  }

  private static escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}
