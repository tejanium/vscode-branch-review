import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileDiff } from '../services/gitService';
import { SyntaxHighlighter } from './syntaxHighlighter';
import {
  fileDiffTemplate,
  diffTableTemplate,
  hunkHeaderTemplate,
  unchangedRowTemplate,
  changedRowTemplate,
} from './templates';

export interface WebviewData {
  currentBranch: string;
  baseBranch: string;
  diff: FileDiff[];
  allBranches: string[];
  diffStats: { added: number; removed: number };
  isLoading?: boolean;
  reviewMode?: 'branch-compare' | 'working-changes';
  warningMessage?: string;
}

export class WebviewRenderer {
  private panel: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;

  constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;
  }

  render(data: WebviewData): string {
    const nonce = this.generateNonce();
    const htmlTemplate = this.loadFile('webview.html');
    const cssContent = this.loadFile('webview.css');

    // Generate webview URIs
    const uris = this.generateWebviewUris();

    // Generate branch options (for old dropdown)
    const branchOptions = this.generateBranchOptions(data.allBranches, data.baseBranch);

    // Generate branches array for new branch controller
    // Escape quotes for HTML attribute but keep JSON structure
    const branchesArray = JSON.stringify(data.allBranches || []).replace(/"/g, '&quot;');

    // Get review mode (defaults to branch-compare for backward compatibility)
    const reviewMode = data.reviewMode || 'branch-compare';

    // Generate diff stats HTML
    const diffStats = data.isLoading
      ? 'Calculating...'
      : `<span style="color: #1a7f37; font-weight: bold;">+${data.diffStats.added}</span> <span style="color: #d1242f; font-weight: bold;">-${data.diffStats.removed}</span>`;

    // Generate diff HTML content
    const diffContent = this.generateDiffHTML(data.diff, reviewMode);

    // Generate mode-specific display text
    const displayBranch = reviewMode === 'working-changes' ? 'HEAD' : data.baseBranch;
    const displayCurrent =
      reviewMode === 'working-changes' ? 'Working Directory' : data.currentBranch;

    // Generate display control for headers
    const branchCompareDisplay =
      reviewMode === 'branch-compare'
        ? 'display: flex; align-items: center; gap: 8px;'
        : 'display: none;';
    const workingChangesDisplay =
      reviewMode === 'working-changes'
        ? 'display: flex; align-items: center; gap: 8px;'
        : 'display: none;';

    // Replace all placeholders
    let html = htmlTemplate
      .replace(/\{\{baseBranch\}\}/g, displayBranch)
      .replace(/\{\{currentBranch\}\}/g, displayCurrent)
      .replace(/\{\{branchOptions\}\}/g, branchOptions)
      .replace(/\{\{branchesArray\}\}/g, branchesArray)
      .replace(/\{\{diffStats\}\}/g, diffStats)
      .replace(/\{\{diffContent\}\}/g, diffContent)
      .replace(/\{\{reviewMode\}\}/g, reviewMode)
      .replace(/\{\{branchCompareDisplay\}\}/g, branchCompareDisplay)
      .replace(/\{\{workingChangesDisplay\}\}/g, workingChangesDisplay)
      .replace(/\{\{nonce\}\}/g, nonce)
      .replace(/\{\{cssPlaceholder\}\}/g, `<style>${cssContent}</style>`);

    // Add mode-specific classes to buttons - replace in order of appearance
    const replacements: string[] = [];
    if (reviewMode === 'branch-compare') {
      replacements.push('br-mode-btn active'); // First button (branch compare) - active
      replacements.push('br-mode-btn inactive'); // Second button (working changes) - inactive
    } else {
      replacements.push('br-mode-btn inactive'); // First button (branch compare) - inactive
      replacements.push('br-mode-btn active'); // Second button (working changes) - active
    }

    // Replace each occurrence in order
    let replacementIndex = 0;
    html = html.replace(/class="br-mode-btn"/g, () => {
      const replacement = `class="${replacements[replacementIndex] || 'br-mode-btn'}"`;
      replacementIndex++;
      return replacement;
    });

    // Replace script URIs
    Object.entries(uris).forEach(([placeholder, uri]) => {
      html = html.replace(placeholder, uri);
    });

    // Show/hide loading state
    if (data.isLoading) {
      html = html
        .replace(
          'style="display: none;" data-app-target="loadingState"',
          'style="display: block;" data-app-target="loadingState"'
        )
        .replace(
          'data-app-target="mainContent"',
          'style="display: none;" data-app-target="mainContent"'
        );
    }

    // Show warning if there's a warning message
    if (data.warningMessage) {
      html = html
        .replace(
          'style="display: none;" data-app-target="warningRow"',
          'style="display: flex;" data-app-target="warningRow"'
        )
        .replace(
          '<span class="br-warning-text" data-app-target="warningText"></span>',
          `<span class="br-warning-text" data-app-target="warningText">${data.warningMessage}</span>`
        );
    }

    return html;
  }

  static calculateDiffStats(diff: FileDiff[]): { added: number; removed: number } {
    let added = 0;
    let removed = 0;

    diff.forEach(file => {
      file.hunks.forEach(hunk => {
        hunk.lines.forEach(line => {
          if (line.type === 'added') added++;
          else if (line.type === 'removed') removed++;
        });
      });
    });

    return { added, removed };
  }

  private loadFile(filename: string): string {
    const filePath = path.join(this.context.extensionPath, 'out', 'webview', filename);
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      return '';
    }
  }

  private generateWebviewUris(): Record<string, string> {
    const files = [
      { placeholder: './stimulus.min.js', file: 'stimulus.min.js' },
      { placeholder: './app.js', file: 'app.js' },
      { placeholder: './events.js', file: 'events.js' },
    ];

    const uris: Record<string, string> = {};
    files.forEach(({ placeholder, file }) => {
      uris[placeholder] = this.panel.webview
        .asWebviewUri(
          vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview', file))
        )
        .toString();
    });

    return uris;
  }

  private generateBranchOptions(allBranches: string[], baseBranch: string): string {
    if (!allBranches.length)
      return `<div class="branch-dropdown-item selected">${baseBranch}</div>`;

    return allBranches
      .map(
        branch =>
          `<div class="branch-dropdown-item ${branch === baseBranch ? 'selected' : ''}" data-action="click->app#chooseBranch" data-app-branch-value="${branch}">${branch}</div>`
      )
      .join('');
  }

  private generateDiffHTML(diff: FileDiff[], reviewMode?: string): string {
    if (!diff.length) {
      return this.generateEmptyStateHTML(reviewMode);
    }

    return diff.map(file => this.renderFileDiff(file)).join('');
  }

  private generateEmptyStateHTML(reviewMode?: string): string {
    const isWorkingChanges = reviewMode === 'working-changes';

    const title = isWorkingChanges ? 'No Uncommitted Changes' : 'No Changes Found';
    const description = isWorkingChanges
      ? 'Your working directory is clean - all changes have been committed.'
      : 'There are no differences to review between the selected branches.';

    const suggestions = isWorkingChanges
      ? [
          'Make some changes to your files',
          'Switch to "Branch Compare" mode to review committed changes',
          'Create a new branch and make changes',
        ]
      : [
          'Switch to a different branch with changes',
          'Compare with a different base branch',
          'Switch to "Working Changes" mode if you have uncommitted changes',
          'Make some changes and commit them',
        ];

    return `
      <div class="br-empty-state">
        <div class="br-empty-state-content">
          <svg class="br-empty-state-icon" width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.75 1.75V5h3.25a.75.75 0 0 1 0 1.5H8.75v3.25a.75.75 0 0 1-1.5 0V6.5H3.5a.75.75 0 0 1 0-1.5h3.75V1.75a.75.75 0 0 1 1.5 0Z"/>
          </svg>
          <h3 class="br-empty-state-title">${title}</h3>
          <p class="br-empty-state-description">${description}</p>
          <div class="br-empty-state-suggestions">
            <p><strong>What you can do:</strong></p>
            <ul>
              ${suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  private renderFileDiff(file: FileDiff): string {
    const addedLines = file.hunks.reduce(
      (sum, hunk) => sum + hunk.lines.filter(line => line.type === 'added').length,
      0
    );
    const removedLines = file.hunks.reduce(
      (sum, hunk) => sum + hunk.lines.filter(line => line.type === 'removed').length,
      0
    );

    return fileDiffTemplate({
      filePath: file.filePath,
      addedLines,
      removedLines,
      tableContent: this.renderUnifiedTable(file),
    });
  }

  private renderUnifiedTable(file: FileDiff): string {
    const rows = this.renderTableRows(file);

    return diffTableTemplate({
      filePath: file.filePath,
      rows,
    });
  }

  private renderTableRows(file: FileDiff): string {
    const rows: string[] = [];

    for (const hunk of file.hunks) {
      // Add hunk header
      const hunkHeader = `@@ -${hunk.oldStart},${
        hunk.oldLines || hunk.lines.filter(l => l.type !== 'added').length
      } +${hunk.newStart},${
        hunk.newLines || hunk.lines.filter(l => l.type !== 'removed').length
      } @@`;

      rows.push(hunkHeaderTemplate(hunkHeader));

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;
      let i = 0;

      while (i < hunk.lines.length) {
        const line = hunk.lines[i];

        if (line.type === 'unchanged') {
          // Unchanged lines: show same content on both sides
          rows.push(
            unchangedRowTemplate({
              filePath: file.filePath,
              oldLine,
              newLine,
              content: line.content,
            })
          );
          oldLine++;
          newLine++;
          i++;
        } else {
          // Handle removed/added lines: pair them up on same rows
          const removedLines: typeof hunk.lines = [];
          const addedLines: typeof hunk.lines = [];

          // Collect consecutive removed lines
          while (i < hunk.lines.length && hunk.lines[i].type === 'removed') {
            removedLines.push(hunk.lines[i]);
            i++;
          }

          // Collect consecutive added lines
          while (i < hunk.lines.length && hunk.lines[i].type === 'added') {
            addedLines.push(hunk.lines[i]);
            i++;
          }

          // Pair them up
          const maxLines = Math.max(removedLines.length, addedLines.length);

          for (let j = 0; j < maxLines; j++) {
            const removedLine = removedLines[j];
            const addedLine = addedLines[j];

            let oldLineNum = '';
            let oldContent = '';
            let newLineNum = '';
            let newContent = '';
            let newLineId = '';
            let rowClass = '';

            if (removedLine) {
              oldLineNum = oldLine.toString();
              const highlightedOldContent = SyntaxHighlighter.addSyntaxHighlighting(
                removedLine.content,
                file.filePath
              );
              oldContent = `<pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${highlightedOldContent}</pre>`;
              oldLine++;
            }

            if (addedLine) {
              newLineNum = newLine.toString();
              const highlightedNewContent = SyntaxHighlighter.addSyntaxHighlighting(
                addedLine.content,
                file.filePath
              );
              newContent = `<button class="br-comment-btn" data-line-number="${newLine}" data-action="click->comment#addComment">+</button><pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${highlightedNewContent}</pre>`;
              newLineId = `${file.filePath}:new:${newLine}`;
              newLine++;
            }

            // Determine row class
            if (removedLine && addedLine) {
              rowClass = 'br-line-modified';
            } else if (removedLine) {
              rowClass = 'br-line-removed';
            } else if (addedLine) {
              rowClass = 'br-line-added';
            }

            rows.push(
              changedRowTemplate({
                rowClass,
                lineId: newLineId
                  ? `data-line-id="${newLineId}" data-selection-target="selectableRow"`
                  : '',
                oldLineNum,
                oldContent,
                newLineNum,
                newContent,
                newLineAttrs: newLineId
                  ? `data-line-number="${newLineNum}" data-action="click->selection#select"`
                  : '',
                newContentAttrs: '',
              })
            );
          }
        }
      }
    }

    return rows.join('');
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private generateNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
