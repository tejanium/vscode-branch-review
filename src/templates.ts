// Template functions for HTML generation
// This is the most common pattern in VS Code extensions - simple template literal functions
import { SyntaxHighlighter } from './syntaxHighlighter';

// Import the events constants to ensure consistency
// Note: Since this is a TypeScript file that generates strings for HTML,
// we still need to use the event names as strings in the templates.
// The events.js file serves as the source of truth for these strings.
const EVENTS = {
  COMMENTS: {
    UPDATED: 'comments:updated',
    UPDATED_FORWARDED: 'comments:updated-forwarded',
  },
  LINE_SELECTION: {
    REQUEST: 'line-selection:request',
    RESPONSE: 'line-selection:response',
    CLEAR: 'line-selection:clear',
  },
  SELECTION: {
    CHANGED: 'selection:changed',
  },
};

export const fileDiffTemplate = (data: {
  filePath: string;
  addedLines: number;
  removedLines: number;
  tableContent: string;
}) => `
<div class="br-file">
  <div class="br-file-header">
    <div class="br-file-info" data-controller="file" data-file-file-path-value="${data.filePath}">
      <span class="br-file-path clickable" data-action="click->file#open">${data.filePath}</span>
      <button class="br-copy-btn" data-action="click->file#copy" title="Copy file name to clipboard">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
          <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
        </svg>
      </button>
    </div>
    <div class="br-file-stats">
      <span class="br-added">+${data.addedLines}</span>
      <span class="br-removed">-${data.removedLines}</span>
    </div>
  </div>
  <div class="split-view">
    ${data.tableContent}
  </div>
</div>`;

export const diffTableTemplate = (data: { filePath: string; rows: string }) => `
<table class="br-unified-diff-table" data-controller="selection comment" data-selection-file-path-value="${data.filePath}" data-comment-file-path-value="${data.filePath}" data-action="${EVENTS.LINE_SELECTION.REQUEST}->selection#handleSelectionRequest ${EVENTS.LINE_SELECTION.CLEAR}->selection#handleClearRequest ${EVENTS.LINE_SELECTION.RESPONSE}->comment#handleSelectionResponse ${EVENTS.SELECTION.CHANGED}->comment#handleSelectionChanged ${EVENTS.COMMENTS.UPDATED_FORWARDED}->comment#handleCommentsUpdated">
  <colgroup>
    <col style="width: 1%;">
    <col style="width: 49%;">
    <col style="width: 1%;">
    <col style="width: 49%;">
  </colgroup>
  ${data.rows}
</table>`;

export const hunkHeaderTemplate = (hunkHeader: string) => `
<tr class="br-hunk-header">
  <td class="br-hunk-header-line">...</td>
  <td colspan="3" class="br-hunk-header-content">
    <span class="br-hunk-header-text">${hunkHeader}</span>
  </td>
</tr>`;

export const unchangedRowTemplate = (data: {
  filePath: string;
  oldLine: number;
  newLine: number;
  content: string;
}) => {
  const highlightedContent = SyntaxHighlighter.addSyntaxHighlighting(data.content, data.filePath);
  return `
<tr class="br-diff-row" data-line-id="${data.filePath}:new:${data.newLine}" data-selection-target="selectableRow">
  <td class="br-diff-line-num br-old-line-num" data-controller="line" data-line-file-path-value="${data.filePath}" data-line-line-number-value="${data.oldLine}" data-action="click->line#select">${data.oldLine}</td>
  <td class="br-diff-line-content br-old-content" data-search-target="searchableContent" data-controller="line" data-line-file-path-value="${data.filePath}" data-line-line-number-value="${data.oldLine}" data-action="click->line#select">
    <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${highlightedContent}</pre>
  </td>
  <td class="br-diff-line-num br-new-line-num" data-controller="line" data-line-file-path-value="${data.filePath}" data-line-line-number-value="${data.newLine}" data-action="click->line#select">${data.newLine}</td>
  <td class="br-diff-line-content br-new-content" data-search-target="searchableContent" data-controller="line" data-line-file-path-value="${data.filePath}" data-line-line-number-value="${data.newLine}" data-action="click->line#select">
    <button class="br-comment-btn" data-controller="line" data-line-file-path-value="${data.filePath}" data-line-line-number-value="${data.newLine}" data-action="click->line#addComment">+</button>
    <pre class="code-font" style="margin: 0; white-space: pre-wrap; font-family: inherit;">${highlightedContent}</pre>
  </td>
</tr>`;
};

export const changedRowTemplate = (data: {
  rowClass: string;
  lineId: string;
  oldLineNum: string;
  oldContent: string;
  newLineNum: string;
  newContent: string;
  newLineAttrs: string;
  newContentAttrs: string;
}) => `
<tr class="br-diff-row ${data.rowClass}" ${data.lineId}>
  <td class="br-diff-line-num br-old-line-num">${data.oldLineNum}</td>
  <td class="br-diff-line-content br-old-content" data-search-target="searchableContent">${data.oldContent}</td>
  <td class="br-diff-line-num br-new-line-num" ${data.newLineAttrs}>${data.newLineNum}</td>
  <td class="br-diff-line-content br-new-content" data-search-target="searchableContent" ${data.newContentAttrs}>${data.newContent}</td>
</tr>`;
