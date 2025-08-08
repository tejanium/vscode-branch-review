import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GitService, FileDiff } from "./gitService";
import { CommentStorage, Comment } from "./commentStorage";
import { WEBVIEW_COMMANDS, LANGUAGE_MAP } from "./constants";
import * as Prism from "prismjs";

// Import all PrismJS language components (298+ languages)
// Using the official loader function with no arguments loads ALL languages
const loadLanguages = require("prismjs/components/");
loadLanguages(); // Load all 298+ languages

export class ReviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private gitService: GitService;
  private commentStorage: CommentStorage;
  private workspaceRoot: string;
  private currentDiff: FileDiff[] = [];
  private currentBaseBranch: string = "";

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

  async showReview(
    currentBranch: string,
    baseBranch: string,
    diff: FileDiff[]
  ) {
    this.currentDiff = diff;

    // Show panel with loading state immediately
    this.showLoadingPanel(currentBranch, baseBranch);

    // Then load the actual content
    await this.loadReviewContent(currentBranch, baseBranch, diff);
  }

  async showReviewWithLoading(currentBranch: string) {
    // Show loading panel immediately with minimal info
    this.showLoadingPanel(currentBranch, "main");

    try {
      // Do all the heavy Git operations in background
      this.updateLoadingStatus("Detecting main branch...");
      const mainBranch = await this.gitService.getMainBranch(
        this.workspaceRoot
      );

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

      this.updateLoadingStatus("Calculating diff with main branch...");
      const diff = await this.gitService.getDiffWithMain(this.workspaceRoot);

      if (diff.length === 0) {
        if (this.panel) {
          this.panel.webview.postMessage({
            command: WEBVIEW_COMMANDS.SHOW_ERROR,
            message:
              "No differences found between current branch and main branch",
          });
        }
        return;
      }

      // Set the diff for later use
      this.currentDiff = diff;

      // Now load the full content
      await this.loadReviewContent(currentBranch, mainBranch, diff);
    } catch (error) {
      console.error("Error during review loading:", error);
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "showError",
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
      "branchReview",
      "Branch Review",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // Set loading HTML immediately
    this.panel.webview.html = this.getLoadingHTML(currentBranch, baseBranch);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.setupWebviewMessageHandling();
  }

  private async loadReviewContent(
    currentBranch: string,
    baseBranch: string,
    diff: FileDiff[]
  ) {
    try {
      // Send status updates to the webview
      this.updateLoadingStatus("Fetching available branches...");
      const allBranches = await this.gitService.getAllBranches(
        this.workspaceRoot
      );

      this.updateLoadingStatus("Generating diff content...");
      // Generate the full content
      const fullContent = this.getWebviewContent(
        currentBranch,
        baseBranch,
        diff,
        allBranches
      );

      this.updateLoadingStatus("Finalizing...");
      // Update the webview with full content
      if (this.panel) {
        this.panel.webview.html = fullContent;
        setTimeout(() => {
          this.hideLoading();
          this.loadComments();
        }, 100);
      }
    } catch (error) {
      console.error("Error loading review content:", error);
      if (this.panel) {
        this.panel.webview.postMessage({
          command: "showError",
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

  private getLoadingHTML(currentBranch: string, baseBranch: string): string {
    // Read the HTML template and CSS
    const htmlPath = path.join(__dirname, "webview", "webview.html");
    const cssPath = path.join(__dirname, "webview", "webview.css");
    const jsPath = path.join(__dirname, "webview", "webview.js");

    const htmlContent = fs.readFileSync(htmlPath, "utf8");
    const cssContent = fs.readFileSync(cssPath, "utf8");
    const jsContent = fs.readFileSync(jsPath, "utf8");

    // Create a loading version with minimal data
    return htmlContent
      .replace("{{baseBranch}}", baseBranch)
      .replace("{{currentBranch}}", currentBranch)
      .replace(
        "{{branchOptions}}",
        `<div class="branch-dropdown-item selected">${baseBranch}</div>`
      )
      .replace("{{diffStats}}", "Calculating...")
      .replace("{{diffContent}}", "") // Empty content initially
      .replace(
        '<link rel="stylesheet" href="webview.css">',
        `<style>${cssContent}</style>`
      )
      .replace(
        '<script src="webview.js"></script>',
        `<script>
          ${jsContent}
          // Show loading state immediately
          showLoading('Initializing Git operations...');

          // Listen for loading status updates
          window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateLoadingStatus') {
              updateLoadingStatus(message.message);
            } else if (message.command === 'hideLoading') {
              hideLoading();
            }
          });
        </script>`
      );
  }

  private setupWebviewMessageHandling() {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleWebviewMessage(message);
      },
      undefined,
      this.context.subscriptions
    );
  }

  private async handleWebviewMessage(message: any) {
    switch (message.command) {
      case WEBVIEW_COMMANDS.ADD_COMMENT:
        this.commentStorage.addComment(message.data);
        await this.loadComments();
        break;
      case WEBVIEW_COMMANDS.DELETE_COMMENT:
        if (message.data.id) {
          // Delete by ID (new format)
          this.commentStorage.deleteComment(message.data.id);
        } else if (
          message.data.filePath &&
          message.data.startLine &&
          message.data.endLine
        ) {
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
        vscode.commands.executeCommand("branchReview.submitComments");
        break;
      case WEBVIEW_COMMANDS.OPEN_FILE:
        await this.openFile(message.filePath);
        break;
    }
  }

  private async openFile(filePath: string) {
    if (!filePath) {
      console.error("No file path provided");
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
        console.error(`File not found: ${filePath}`, statError);
      }
    } catch (error) {
      console.error("Error opening file:", error);
      vscode.window.showErrorMessage(`Error opening file: ${filePath}`);
    }
  }

  private async loadComments() {
    if (this.panel) {
      this.panel.webview.postMessage({
        command: WEBVIEW_COMMANDS.COMMENTS_UPDATED,
        comments: this.commentStorage.getAllComments(),
      });
    }
  }

  private async refreshCurrentView(baseBranch?: string) {
    try {
      const currentBranch = await this.gitService.getCurrentBranch(
        this.workspaceRoot
      );
      const selectedBaseBranch =
        baseBranch ||
        this.currentBaseBranch ||
        (await this.gitService.getMainBranch(this.workspaceRoot));

      // Update the stored base branch
      this.currentBaseBranch = selectedBaseBranch;

      const diff = await this.gitService.getDiffWithBranch(
        this.workspaceRoot,
        selectedBaseBranch
      );
      const allBranches = await this.gitService.getAllBranches(
        this.workspaceRoot
      );

      if (this.panel) {
        this.panel.webview.html = this.getWebviewContent(
          currentBranch,
          selectedBaseBranch,
          diff,
          allBranches
        );
        setTimeout(() => this.loadComments(), 100);
      }
    } catch (error) {
      console.error("Error refreshing diff:", error);
      vscode.window.showErrorMessage(`Failed to refresh diff: ${error}`);
    }
  }

  private loadWebviewFile(filename: string): string {
    const filePath = path.join(__dirname, "webview", filename);
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (error) {
      console.error(`Failed to load ${filename}:`, error);
      return "";
    }
  }

  private calculateDiffStats(diff: FileDiff[]): {
    added: number;
    removed: number;
  } {
    let added = 0;
    let removed = 0;

    diff.forEach((file) => {
      file.hunks.forEach((hunk) => {
        hunk.lines.forEach((line) => {
          if (line.type === "added") {
            added++;
          } else if (line.type === "removed") {
            removed++;
          }
        });
      });
    });

    return { added, removed };
  }

  private getWebviewContent(
    currentBranch: string,
    baseBranch: string,
    diff: FileDiff[],
    allBranches: string[] = []
  ): string {
    const htmlTemplate = this.loadWebviewFile("webview.html");
    const cssContent = this.loadWebviewFile("webview.css");
    const jsContent = this.loadWebviewFile("webview.js");

    const diffContent = diff.map((file) => this.renderFileDiff(file)).join("");

    // Calculate diff stats
    const stats = this.calculateDiffStats(diff);
    const diffStats = `<span style="color: #1a7f37; font-weight: bold;">+${stats.added}</span> <span style="color: #d1242f; font-weight: bold;">-${stats.removed}</span>`;

    // Ensure we have branches to work with
    if (allBranches.length === 0) {
      console.warn("No branches provided, adding current branches");
      allBranches = [baseBranch, currentBranch].filter(
        (branch, index, arr) => arr.indexOf(branch) === index
      );
    }

    // Generate branch options for dropdown
    const branchOptions = allBranches
      .map(
        (branch) =>
          `<div class="branch-dropdown-item ${
            branch === baseBranch ? "selected" : ""
          }" onclick="chooseBranch('${branch}')">${branch}</div>`
      )
      .join("");

    // Safety check - ensure we have branch options
    if (branchOptions.length === 0) {
      console.warn("No branch options available, using fallback");
    }

    const finalHtml = htmlTemplate
      .replace("{{baseBranch}}", baseBranch)
      .replace("{{currentBranch}}", currentBranch)
      .replace("{{branchOptions}}", branchOptions)
      .replace("{{diffStats}}", diffStats)
      .replace("{{diffContent}}", diffContent)
      .replace(
        '<link rel="stylesheet" href="webview.css">',
        `<style>${cssContent}</style>`
      )
      .replace(
        '<script src="webview.js"></script>',
        `<script>${jsContent}</script>`
      );

    return finalHtml;
  }

  private renderFileDiff(file: FileDiff): string {
    const addedLines = file.hunks.reduce(
      (sum, hunk) =>
        sum + hunk.lines.filter((line) => line.type === "added").length,
      0
    );
    const removedLines = file.hunks.reduce(
      (sum, hunk) =>
        sum + hunk.lines.filter((line) => line.type === "removed").length,
      0
    );

    return `
        <div class="br-file">
            <div class="br-file-header">
                <div class="br-file-info">
                    <span class="br-file-path clickable" onclick="openFile('${this.escapeJavaScript(
                      file.filePath
                    )}')">${file.filePath}</span>
                    <button class="br-copy-btn" onclick="copyFileNameToClipboard('${this.escapeJavaScript(
                      file.filePath
                    )}')" title="Copy file name to clipboard">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
                            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
                        </svg>
                    </button>
                </div>
                <div class="br-file-stats">
                    <span class="br-added">+${addedLines}</span>
                    <span class="br-removed">-${removedLines}</span>
                </div>
            </div>
            <div class="split-view">
                ${this.renderSplitView(file)}
            </div>
        </div>
    `;
  }

  private renderSplitView(file: FileDiff): string {
    return this.renderUnifiedTable(file);
  }

  private renderUnifiedTable(file: FileDiff): string {
    let tableHtml = '<table class="br-unified-diff-table">';

    for (const hunk of file.hunks) {
      // Add hunk header spanning all 4 columns
      const hunkHeader = `@@ -${hunk.oldStart},${
        hunk.oldLines || hunk.lines.filter((l) => l.type !== "added").length
      } +${hunk.newStart},${
        hunk.newLines || hunk.lines.filter((l) => l.type !== "removed").length
      } @@`;

      tableHtml += `
        <tr class="br-hunk-header">
          <td class="br-hunk-header-line">...</td>
          <td colspan="3" class="br-hunk-header-content">
            <span class="br-hunk-header-text">${hunkHeader}</span>
          </td>
        </tr>
      `;

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      // Group lines for proper GitHub-style pairing
      const lines = hunk.lines;
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        if (line.type === "unchanged") {
          // Unchanged lines: show same content on both sides
          const oldLineNum = oldLine.toString();
          const newLineNum = newLine.toString();
          const content = this.addSyntaxHighlighting(
            line.content,
            file.filePath
          );
          const oldLineId = `${file.filePath}:old:${oldLineNum}`;
          const newLineId = `${file.filePath}:new:${newLineNum}`;

          tableHtml += `
            <tr class="br-diff-row" data-line-id="${newLineId}">
              <td class="br-diff-line-num br-old-line-num" onclick="selectLine('${this.escapeJavaScript(
                file.filePath
              )}', ${oldLineNum}, this, event)">${oldLineNum}</td>
              <td class="br-diff-line-content br-old-content" onclick="selectLine('${this.escapeJavaScript(
                file.filePath
              )}', ${oldLineNum}, this, event)">
                <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${content}</pre>
              </td>
              <td class="br-diff-line-num br-new-line-num" onclick="selectLine('${this.escapeJavaScript(
                file.filePath
              )}', ${newLineNum}, this, event)">${newLineNum}</td>
              <td class="br-diff-line-content br-new-content" onclick="selectLine('${this.escapeJavaScript(
                file.filePath
              )}', ${newLineNum}, this, event)">
                <button class="br-comment-btn" onclick="addCommentAtLine('${this.escapeJavaScript(
                  file.filePath
                )}', ${newLineNum}, event)">+</button>
                <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${content}</pre>
              </td>
            </tr>
          `;
          oldLine++;
          newLine++;
          i++;
        } else {
          // Handle removed/added lines: pair them up on same rows
          const removedLines: typeof lines = [];
          const addedLines: typeof lines = [];

          // Collect consecutive removed lines
          while (i < lines.length && lines[i].type === "removed") {
            removedLines.push(lines[i]);
            i++;
          }

          // Collect consecutive added lines
          while (i < lines.length && lines[i].type === "added") {
            addedLines.push(lines[i]);
            i++;
          }

          // Pair them up (GitHub style: align corresponding lines)
          const maxLines = Math.max(removedLines.length, addedLines.length);

          for (let j = 0; j < maxLines; j++) {
            const removedLine = removedLines[j];
            const addedLine = addedLines[j];

            let oldLineNum = "";
            let oldContent = "";
            let oldLineId = "";
            let newLineNum = "";
            let newContent = "";
            let newLineId = "";
            let rowClass = "";

            if (removedLine) {
              oldLineNum = oldLine.toString();
              oldContent = this.addSyntaxHighlighting(
                removedLine.content,
                file.filePath
              );
              oldLineId = `${file.filePath}:old:${oldLineNum}`;
              oldLine++;
            }

            if (addedLine) {
              newLineNum = newLine.toString();
              newContent = this.addSyntaxHighlighting(
                addedLine.content,
                file.filePath
              );
              newLineId = `${file.filePath}:new:${newLineNum}`;
              newLine++;
            }

            // Determine row class based on what's present
            if (removedLine && addedLine) {
              rowClass = "br-line-modified"; // Both sides have content (modified line)
            } else if (removedLine) {
              rowClass = "br-line-removed"; // Only old side (removed line)
            } else if (addedLine) {
              rowClass = "br-line-added"; // Only new side (added line)
            }

            tableHtml += `
              <tr class="br-diff-row ${rowClass}" ${
              newLineId ? `data-line-id="${newLineId}"` : ""
            }>
                <td class="br-diff-line-num br-old-line-num" ${
                  oldLineId
                    ? `onclick="selectLine('${this.escapeJavaScript(
                        file.filePath
                      )}', ${oldLineNum}, this, event)"`
                    : ""
                }>${oldLineNum}</td>
                <td class="br-diff-line-content br-old-content" ${
                  oldLineId
                    ? `onclick="selectLine('${this.escapeJavaScript(
                        file.filePath
                      )}', ${oldLineNum}, this, event)"`
                    : ""
                }>
                  <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${oldContent}</pre>
                </td>
                <td class="br-diff-line-num br-new-line-num" ${
                  newLineId
                    ? `onclick="selectLine('${this.escapeJavaScript(
                        file.filePath
                      )}', ${newLineNum}, this, event)"`
                    : ""
                }>${newLineNum}</td>
                <td class="br-diff-line-content br-new-content" ${
                  newLineId
                    ? `onclick="selectLine('${this.escapeJavaScript(
                        file.filePath
                      )}', ${newLineNum}, this, event)"`
                    : ""
                }>
                  ${
                    newLineId
                      ? `<button class="br-comment-btn" onclick="addCommentAtLine('${this.escapeJavaScript(
                          file.filePath
                        )}', ${newLineNum}, event)">+</button>`
                      : ""
                  }
                  <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${newContent}</pre>
                </td>
              </tr>
            `;
          }
        }
      }
    }

    tableHtml += "</table>";
    return tableHtml;
  }

  private renderAlignedTables(file: FileDiff): [string, string] {
    let oldTableHtml = '<table class="br-diff-table">';
    let newTableHtml = '<table class="br-diff-table">';

    for (const hunk of file.hunks) {
      // Add hunk header to both sides
      const hunkHeader = `@@ -${hunk.oldStart},${
        hunk.oldLines || hunk.lines.filter((l) => l.type !== "added").length
      } +${hunk.newStart},${
        hunk.newLines || hunk.lines.filter((l) => l.type !== "removed").length
      } @@`;

      const hunkHeaderRow = `
        <tr class="br-hunk-header">
          <td class="br-hunk-header-line">...</td>
          <td class="br-hunk-header-content">
            <span class="br-hunk-header-text">${hunkHeader}</span>
          </td>
        </tr>
      `;

      oldTableHtml += hunkHeaderRow;
      newTableHtml += hunkHeaderRow;

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const line of hunk.lines) {
        if (line.type === "removed" || line.type === "unchanged") {
          // Add to old side
          const actualLineId = `${file.filePath}:old:${oldLine}`;
          const rowClass = line.type === "removed" ? "br-line-removed" : "";

          oldTableHtml += `
            <tr class="br-diff-row ${rowClass}" data-line-id="${actualLineId}">
              <td class="br-diff-line-num" onclick="selectLine('${
                file.filePath
              }', ${oldLine}, this, event)">
                ${oldLine}
              </td>
              <td class="br-diff-line-content" onclick="selectLine('${
                file.filePath
              }', ${oldLine}, this, event)">
                <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${this.addSyntaxHighlighting(
                  line.content,
                  file.filePath
                )}</pre>
              </td>
            </tr>
          `;
          oldLine++;
        } else {
          // Add padding row to old side for added lines
          oldTableHtml += `
            <tr class="br-diff-row">
              <td class="br-diff-line-num"></td>
              <td class="br-diff-line-content"></td>
            </tr>
          `;
        }

        if (line.type === "added" || line.type === "unchanged") {
          // Add to new side
          const actualLineId = `${file.filePath}:new:${newLine}`;
          const rowClass = line.type === "added" ? "br-line-added" : "";

          newTableHtml += `
            <tr class="br-diff-row ${rowClass}" data-line-id="${actualLineId}">
              <td class="br-diff-line-num" onclick="selectLine('${
                file.filePath
              }', ${newLine}, this, event)">
                ${newLine}
              </td>
              <td class="br-diff-line-content" onclick="selectLine('${
                file.filePath
              }', ${newLine}, this, event)">
                <button class="br-comment-btn" onclick="addCommentAtLine('${
                  file.filePath
                }', ${newLine}, event)">+</button>
                <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${this.addSyntaxHighlighting(
                  line.content,
                  file.filePath
                )}</pre>
              </td>
            </tr>
          `;
          newLine++;
        } else {
          // Add padding row to new side for removed lines
          newTableHtml += `
            <tr class="br-diff-row">
              <td class="br-diff-line-num"></td>
              <td class="br-diff-line-content"></td>
            </tr>
          `;
        }
      }
    }

    oldTableHtml += "</table>";
    newTableHtml += "</table>";

    return [oldTableHtml, newTableHtml];
  }

  private renderOldSideTable(file: FileDiff): string {
    let tableHtml = '<table class="br-diff-table">';
    let lineCounter = 1;
    let previousHunkEnd = 0;

    for (let hunkIndex = 0; hunkIndex < file.hunks.length; hunkIndex++) {
      const hunk = file.hunks[hunkIndex];
      let oldLine = hunk.oldStart;

      // Add hunk header for each hunk (GitHub style)
      const hunkHeader = `@@ -${hunk.oldStart},${
        hunk.oldLines || hunk.lines.filter((l) => l.type !== "added").length
      } +${hunk.newStart},${
        hunk.newLines || hunk.lines.filter((l) => l.type !== "removed").length
      } @@`;

      tableHtml += `
        <tr class="br-hunk-header">
          <td class="br-hunk-header-line">...</td>
          <td class="br-hunk-header-content">
            <span class="br-hunk-header-text">${hunkHeader}</span>
          </td>
        </tr>
      `;

      for (const line of hunk.lines) {
        let shouldShow = false;
        let lineNum = "";
        let rowClass = "";

        if (line.type === "removed" || line.type === "unchanged") {
          shouldShow = true;
          lineNum = oldLine.toString();
          rowClass = line.type === "removed" ? "br-line-removed" : "";
          oldLine++;
        }

        if (shouldShow) {
          const actualLineNum = parseInt(lineNum);
          const actualLineId = `${file.filePath}:old:${actualLineNum}`;

          tableHtml += `
             <tr class="br-diff-row ${rowClass}" data-line-id="${actualLineId}">
               <td class="br-diff-line-num" onclick="selectLine('${
                 file.filePath
               }', ${actualLineNum}, this, event)">
                 ${lineNum}
               </td>
               <td class="br-diff-line-content" onclick="selectLine('${
                 file.filePath
               }', ${actualLineNum}, this, event)">
                 <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${this.addSyntaxHighlighting(
                   line.content,
                   file.filePath
                 )}</pre>
               </td>
             </tr>
           `;
        }

        lineCounter++;
      }

      // Update the previous hunk end for line jump detection
      previousHunkEnd = oldLine - 1;
    }

    tableHtml += "</table>";
    return tableHtml;
  }

  private renderNewSideTable(file: FileDiff): string {
    let tableHtml = '<table class="br-diff-table">';
    let lineCounter = 1;
    let previousHunkEnd = 0;

    for (let hunkIndex = 0; hunkIndex < file.hunks.length; hunkIndex++) {
      const hunk = file.hunks[hunkIndex];
      let newLine = hunk.newStart;

      // Add hunk header for each hunk (GitHub style)
      const hunkHeader = `@@ -${hunk.oldStart},${
        hunk.oldLines || hunk.lines.filter((l) => l.type !== "added").length
      } +${hunk.newStart},${
        hunk.newLines || hunk.lines.filter((l) => l.type !== "removed").length
      } @@`;

      tableHtml += `
        <tr class="br-hunk-header">
          <td class="br-hunk-header-line">...</td>
          <td class="br-hunk-header-content">
            <span class="br-hunk-header-text">${hunkHeader}</span>
          </td>
        </tr>
      `;

      for (const line of hunk.lines) {
        let shouldShow = false;
        let lineNum = "";
        let rowClass = "";

        if (line.type === "added" || line.type === "unchanged") {
          shouldShow = true;
          lineNum = newLine.toString();
          rowClass = line.type === "added" ? "br-line-added" : "";
          newLine++;
        }

        if (shouldShow) {
          const actualLineNum = parseInt(lineNum);
          const actualLineId = `${file.filePath}:new:${actualLineNum}`;

          tableHtml += `
             <tr class="br-diff-row ${rowClass}" data-line-id="${actualLineId}">
               <td class="br-diff-line-num" onclick="selectLine('${
                 file.filePath
               }', ${actualLineNum}, this, event)">
                 ${lineNum}
               </td>
               <td class="br-diff-line-content" onclick="selectLine('${
                 file.filePath
               }', ${actualLineNum}, this, event)">
                 <button class="br-comment-btn" onclick="addCommentAtLine('${
                   file.filePath
                 }', ${actualLineNum}, event)">+</button>
                 <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${this.addSyntaxHighlighting(
                   line.content,
                   file.filePath
                 )}</pre>
               </td>
             </tr>
           `;
        }

        lineCounter++;
      }

      // Update the previous hunk end for line jump detection
      previousHunkEnd = newLine - 1;
    }

    tableHtml += "</table>";
    return tableHtml;
  }

  private addSyntaxHighlighting(content: string, filePath: string): string {
    // Get language from file extension
    const extension = path.extname(filePath).toLowerCase();
    let language = this.getLanguageFromExtension(extension);

    try {
      // Escape HTML first for security
      const escapedContent = this.escapeHtml(content);

      // If we have a supported language, apply Prism.js highlighting
      if (language && Prism.languages[language]) {
        const highlighted = Prism.highlight(
          content,
          Prism.languages[language],
          language
        );
        return highlighted;
      }

      // Fallback to escaped content without highlighting
      return escapedContent;
    } catch (error) {
      console.warn("Syntax highlighting failed:", error);
      return this.escapeHtml(content);
    }
  }

  private getLanguageFromExtension(extension: string): string | null {
    return LANGUAGE_MAP[extension] || null;
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private escapeJavaScript(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }
}
