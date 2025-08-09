// Comment Controller - Handles ALL comment functionality: creation, editing, updating, and deletion
import { Controller } from 'stimulus';
import { EVENTS, dispatchCustomEvent } from '../events.js';

export default class CommentController extends Controller {
  static targets = [
    'commentDisplay',
    'commentFormRow',
    'display',
    'form',
    'textarea',
    'text',
    'commentContainer',
    'editForm',
    'formTextarea',
    'commentForm',
  ];
  static values = {
    filePath: String,
    startLine: Number,
    endLine: Number,
    text: String,
    editFilePath: String,
    editStartLine: Number,
    editEndLine: Number,
    editText: String,
  };

  // Class field arrow functions - automatically bind `this`
  handleSelectionChanged = event => {
    // Could update UI based on selection if needed
  };

  handleCommentsUpdated = event => {
    const comments = event.detail.comments || [];
    const tableFilePath = this.filePathValue;

    // Clear any existing comment displays
    this.commentDisplayTargets.forEach(row => row.remove());

    // Fallback: clear by class within this table (for dynamically created comments)
    // Note: This handles dynamically created comments that may not be registered as targets yet
    const tableCommentRows = this.element.querySelectorAll('.br-comment-display-row');
    tableCommentRows.forEach(row => row.remove());

    // Display only comments that belong to this table's file
    const relevantComments = comments.filter(comment => comment.filePath === tableFilePath);

    relevantComments.forEach(comment => {
      this.displayExistingComment(comment);
    });
  };

  // Store pending requests for async communication
  pendingRequests = new Map();

  // Stimulus action to handle selection responses
  handleSelectionResponse(event) {
    const { requestId, selectedLines } = event.detail;
    const resolver = this.pendingRequests.get(requestId);
    if (resolver) {
      this.pendingRequests.delete(requestId);
      resolver(selectedLines || []);
    }
  }

  // Event-based communication with selection controller
  getSelectedLinesForFile(filePath, requestId) {
    return new Promise(resolve => {
      // Store the resolver for this request
      this.pendingRequests.set(requestId, resolve);

      // Send request on this element (table) - Stimulus will handle it
      dispatchCustomEvent(this.element, EVENTS.LINE_SELECTION.REQUEST, {
        filePath,
        requestId,
      });

      // Timeout fallback
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          resolve([]);
        }
      }, 100);
    });
  }

  clearAllSelections() {
    dispatchCustomEvent(this.element, EVENTS.LINE_SELECTION.CLEAR);
  }

  // Helper function for JavaScript escaping
  escapeJavaScript(text) {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/'/g, "\\'") // Escape single quotes
      .replace(/"/g, '\\"') // Escape double quotes
      .replace(/\n/g, '\\n') // Escape newlines
      .replace(/\r/g, '\\r') // Escape carriage returns
      .replace(/\t/g, '\\t'); // Escape tabs
  }

  connect() {
    // All event listeners now handled declaratively via data-action
  }

  disconnect() {
    // All event listeners now handled declaratively via data-action
  }

  displayExistingComment(comment) {
    const { filePath, startLine, endLine, text } = comment;

    // Find the row to insert the comment after (use the last line of the comment range)
    const insertAfterRow = document.querySelector(`[data-line-id="${filePath}:new:${endLine}"]`);

    if (!insertAfterRow) {
      return;
    }

    // Create comment display row
    const commentRow = document.createElement('tr');
    commentRow.className = 'br-comment-display-row';
    commentRow.setAttribute('data-comment-target', 'commentDisplay');
    commentRow.innerHTML = `
            <td class="br-comment-form-spacer"></td>
            <td class="br-comment-form-spacer"></td>
            <td colspan="2" class="br-inline-comment-cell">
                <div class="br-comment-container" data-comment-target="commentContainer">
                    <div class="br-comment-header">
                        <div class="br-comment-meta">
                            Lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
                        </div>
                        <div class="br-comment-actions">
                            <button class="br-comment-action-btn" data-controller="comment" data-comment-file-path-value="${this.escapeHtml(filePath)}" data-comment-start-line-value="${startLine}" data-comment-end-line-value="${endLine}" data-comment-text-value="${this.escapeHtml(text)}" data-action="click->comment#editInline" title="Edit comment">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Z"/>
                                </svg>
                            </button>
                            <button class="br-comment-action-btn br-comment-action-danger" data-controller="comment" data-comment-file-path-value="${this.escapeHtml(filePath)}" data-comment-start-line-value="${startLine}" data-comment-end-line-value="${endLine}" data-action="click->comment#deleteInline" title="Delete comment">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.748 1.748 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.149ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="br-comment-body">
                        <div class="br-comment-text">${this.escapeHtml(text)}</div>
                    </div>
                </div>
            </td>
        `;

    // Insert the comment display after the target row
    insertAfterRow.parentNode.insertBefore(commentRow, insertAfterRow.nextSibling);
  }

  async addComment(event) {
    // Prevent triggering the parent selection event
    event.stopPropagation();

    // Find the closest element with line-number data attribute
    const targetElement = event.target.closest('[data-line-number]');
    if (!targetElement) {
      return;
    }

    const lineNumber = parseInt(targetElement.dataset.lineNumber);
    const filePath = this.filePathValue;

    if (!lineNumber || !filePath) {
      return;
    }

    // Request selection data via event
    const requestId = Date.now().toString();
    const selectedLines = await this.getSelectedLinesForFile(filePath, requestId);

    // If no lines are selected, default to the line where the + button was clicked
    const finalSelectedLines = selectedLines.length === 0 ? [lineNumber] : selectedLines;

    this.showCommentForm(filePath, finalSelectedLines);
  }

  showCommentForm(filePath, selectedLines) {
    // Remove any existing comment forms using targets
    this.commentFormRowTargets.forEach(form => form.remove());

    const lastLineNumber = selectedLines[selectedLines.length - 1] || 1;
    const insertAfterRow = document.querySelector(
      `[data-line-id="${filePath}:new:${lastLineNumber}"]`
    );

    if (!insertAfterRow) {
      return;
    }

    const startLine = selectedLines[0];
    const endLine = selectedLines[selectedLines.length - 1];

    const commentRow = document.createElement('tr');
    commentRow.className = 'br-comment-form-row';
    commentRow.setAttribute('data-comment-target', 'commentFormRow');
    commentRow.innerHTML = `
            <td class="br-comment-form-spacer"></td>
            <td class="br-comment-form-spacer"></td>
            <td class="br-comment-form-spacer"></td>
            <td class="br-inline-comment-cell">
                <div class="br-comment-container br-comment-container-form" data-comment-target="commentForm">
                    <div class="br-comment-header">
                        <div class="br-comment-meta">
                            New comment · Lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
                        </div>
                    </div>
                    <div class="br-comment-body">
                        <textarea class="br-comment-textarea" data-comment-target="formTextarea" placeholder="Enter your comment..." rows="3"></textarea>
                        <div class="br-comment-form-actions">
                            <button class="br-btn br-btn-secondary" data-action="click->comment#cancelForm">Cancel</button>
                            <button class="br-btn br-btn-primary" data-action="click->comment#submitForFile">Add comment</button>
                        </div>
                    </div>
                </div>
            </td>
        `;

    insertAfterRow.parentNode.insertBefore(commentRow, insertAfterRow.nextSibling);

    // Focus the textarea using Stimulus target (will be available after DOM insertion)
    const textarea = commentRow.querySelector('[data-comment-target="formTextarea"]');
    if (textarea) textarea.focus();
  }

  // Helper function to properly escape text for HTML attributes
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  edit() {
    this.displayTarget.style.display = 'none';
    this.formTarget.style.display = 'block';
    this.textareaTarget.value = this.textValue;
    this.textareaTarget.focus();
    this.textareaTarget.setSelectionRange(
      this.textareaTarget.value.length,
      this.textareaTarget.value.length
    );
  }

  cancel() {
    this.formTarget.style.display = 'none';
    this.displayTarget.style.display = 'block';
  }

  update() {
    const newText = this.textareaTarget.value.trim();
    if (!newText) {
      alert('Please enter a comment');
      return;
    }

    // Update the comment in storage
    window.vscode.postMessage({
      command: 'updateComment',
      data: {
        filePath: this.filePathValue,
        startLine: this.startLineValue,
        endLine: this.endLineValue,
        text: newText,
      },
    });

    // Update the display
    this.textTarget.textContent = newText;
    this.textValue = newText;
    this.cancel();
  }

  delete() {
    // Remove the comment from storage
    window.vscode.postMessage({
      command: 'deleteComment',
      data: {
        filePath: this.filePathValue,
        startLine: this.startLineValue,
        endLine: this.endLineValue,
      },
    });

    // Remove the comment row from DOM
    this.element.closest('tr').remove();
  }

  editInline() {
    // Convert display to edit form (replicating editComment functionality)
    const commentDisplay = this.element.closest('.br-comment-container');
    const filePath = this.filePathValue;
    const startLine = this.startLineValue;
    const endLine = this.endLineValue;
    const text = this.textValue;

    // Create edit form
    const editForm = document.createElement('div');
    editForm.className = 'br-comment-edit-form';
    editForm.setAttribute('data-comment-target', 'editForm');
    editForm.innerHTML = `
            <div class="br-comment-header">
                <div class="br-comment-meta">
                    Edit · Lines ${startLine}${endLine !== startLine ? `-${endLine}` : ''}
                </div>
            </div>
            <div class="br-comment-body">
                <textarea class="br-comment-textarea" data-comment-target="formTextarea" rows="3" placeholder="Update your comment...">${this.escapeJavaScript(text)}</textarea>
                <div class="br-comment-form-actions">
                    <button class="br-btn br-btn-secondary" data-controller="comment" data-action="click->comment#cancelEdit">Cancel</button>
                    <button class="br-btn br-btn-primary" data-controller="comment" data-comment-file-path-value="${filePath}" data-comment-start-line-value="${startLine}" data-comment-end-line-value="${endLine}" data-action="click->comment#updateComment">Update</button>
                </div>
            </div>
        `;

    // Replace comment display with edit form
    commentDisplay.style.display = 'none';
    commentDisplay.parentNode.insertBefore(editForm, commentDisplay.nextSibling);
  }

  deleteInline() {
    const filePath = this.filePathValue;
    const startLine = this.startLineValue;
    const endLine = this.endLineValue;

    // Remove the comment from storage
    window.vscode.postMessage({
      command: 'deleteComment',
      data: {
        filePath,
        startLine,
        endLine,
      },
    });

    // Remove the comment display row
    this.element.closest('tr').remove();
  }

  cancelEdit() {
    // Find the edit form and comment display
    const editForm = this.element.closest('.br-comment-edit-form');
    const commentCell = editForm.closest('.br-inline-comment-cell');
    // Find the comment container that's not the edit form
    const commentDisplay = commentCell.querySelector(
      '.br-comment-container:not(.br-comment-edit-form)'
    );

    // Remove edit form and show original comment
    editForm.remove();
    if (commentDisplay) {
      commentDisplay.style.display = 'block';
    }
  }

  updateComment() {
    const editForm = this.element.closest('.br-comment-edit-form');
    const textarea = editForm.querySelector('[data-comment-target="formTextarea"]');
    const newText = textarea.value.trim();

    if (!newText) {
      alert('Please enter a comment');
      return;
    }

    const filePath = this.filePathValue;
    const startLine = this.startLineValue;
    const endLine = this.endLineValue;

    // Send update to extension
    window.vscode.postMessage({
      command: 'updateComment',
      data: {
        filePath,
        startLine,
        endLine,
        text: newText,
        codeSnippet: `Lines ${startLine}-${endLine}`,
      },
    });

    // Convert back to comment display with updated text (replicating working implementation)
    const commentRow = editForm.closest('tr');
    commentRow.className = 'br-comment-display-row';
    commentRow.innerHTML = `
            <td class="br-comment-form-spacer"></td>
            <td class="br-comment-form-spacer"></td>
            <td colspan="2" class="br-inline-comment-cell">
                <div class="br-comment-container">
                    <div class="br-comment-header">
                        <div class="br-comment-meta">
                            Lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
                        </div>
                        <div class="br-comment-actions">
                            <button class="br-comment-action-btn" data-controller="comment" data-comment-file-path-value="${filePath}" data-comment-start-line-value="${startLine}" data-comment-end-line-value="${endLine}" data-comment-text-value="${this.escapeJavaScript(newText)}" data-action="click->comment#editInline" title="Edit comment">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Z"/>
                                </svg>
                            </button>
                            <button class="br-comment-action-btn br-comment-action-danger" data-controller="comment" data-comment-file-path-value="${filePath}" data-comment-start-line-value="${startLine}" data-comment-end-line-value="${endLine}" data-action="click->comment#deleteInline" title="Delete comment">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.748 1.748 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.149ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="br-comment-body">
                        <div class="br-comment-text">${newText}</div>
                    </div>
                </div>
            </td>
        `;
  }

  // Comment creation and form management
  cancelForm() {
    // Use Stimulus targets to find the form within this controller's scope
    if (this.hasCommentFormTarget) {
      const commentRow = this.commentFormTarget.closest('tr');
      if (commentRow) {
        commentRow.remove();
      }
    }

    // Clear line selections using event
    this.clearAllSelections();
  }

  async submitForFile() {
    // Prevent double submission
    if (this.isSubmitting) {
      return;
    }
    this.isSubmitting = true;

    const filePath = this.filePathValue;

    // Use Stimulus targets to find form elements
    if (!this.hasCommentFormTarget) {
      this.isSubmitting = false;
      return;
    }

    if (!this.hasFormTextareaTarget) {
      this.isSubmitting = false;
      return;
    }

    const text = this.formTextareaTarget.value.trim();
    if (!text) {
      this.isSubmitting = false;
      return;
    }

    // Get selected lines via event
    const requestId = Date.now().toString();
    const fileLines = await this.getSelectedLinesForFile(filePath, requestId);

    if (fileLines.length === 0) {
      // If no lines selected, use the line where comment form was opened
      const formRow = this.commentFormTarget.closest('tr');
      const prevRow = formRow ? formRow.previousElementSibling : null;
      if (prevRow && prevRow.dataset.lineId) {
        const lineId = prevRow.dataset.lineId;
        // Only use if it's a new side line
        if (lineId.includes(':new:')) {
          const lineNumber = parseInt(lineId.split(':')[2]);
          fileLines.push(lineNumber);
        }
      } else {
        this.isSubmitting = false;
        return;
      }
    }

    const startLine = fileLines[0];
    const endLine = fileLines[fileLines.length - 1];

    // Generate a consistent ID based on file path and line numbers
    const commentId = `${filePath}:${startLine}:${endLine}:${Date.now()}`;

    window.vscode.postMessage({
      command: 'addComment',
      data: {
        id: commentId,
        filePath,
        startLine,
        endLine,
        text,
        codeSnippet: `Lines ${startLine}-${endLine}`,
        timestamp: new Date().toISOString(),
      },
    });

    // Remove the comment form - the comment will be displayed when comments:updated arrives
    const formRow = this.commentFormTarget.closest('tr');
    if (formRow) {
      formRow.remove();
    }

    // Clear line selection after submitting comment
    this.clearAllSelections();

    // Reset submission flag
    this.isSubmitting = false;
  }
}
