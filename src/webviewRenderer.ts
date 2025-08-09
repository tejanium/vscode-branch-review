import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileDiff } from './gitService';
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

    // Generate diff stats HTML
    const diffStats = data.isLoading
      ? 'Calculating...'
      : `<span style="color: #1a7f37; font-weight: bold;">+${data.diffStats.added}</span> <span style="color: #d1242f; font-weight: bold;">-${data.diffStats.removed}</span>`;

    // Generate diff HTML content
    const diffContent = this.generateDiffHTML(data.diff);

    // Replace all placeholders
    let html = htmlTemplate
      .replace(/\{\{baseBranch\}\}/g, data.baseBranch)
      .replace(/\{\{currentBranch\}\}/g, data.currentBranch)
      .replace(/\{\{branchOptions\}\}/g, branchOptions)
      .replace(/\{\{branchesArray\}\}/g, branchesArray)
      .replace(/\{\{diffStats\}\}/g, diffStats)
      .replace(/\{\{diffContent\}\}/g, diffContent)
      .replace(/\{\{nonce\}\}/g, nonce)
      .replace(/\{\{cssPlaceholder\}\}/g, `<style>${cssContent}</style>`);

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

    // Debug logging to verify stats calculation
    console.log(
      `[WebviewRenderer] Calculated diff stats: +${added} -${removed} for ${diff.length} files`
    );

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

  private generateDiffHTML(diff: FileDiff[]): string {
    if (!diff.length) return '';

    return diff.map(file => this.renderFileDiff(file)).join('');
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
              newContent = `<button class="br-comment-btn" data-action="click->comment#addComment" data-line-number="${newLine}">+</button><pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${highlightedNewContent}</pre>`;
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
                  ? `data-action="click->selection#select" data-line-number="${newLineNum}"`
                  : '',
                newContentAttrs: newLineId
                  ? `data-action="click->selection#select" data-line-number="${newLineNum}"`
                  : '',
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
