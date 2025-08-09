const vscode = acquireVsCodeApi();
let comments = [];
let selectedLines = new Set();

// Helper function to properly escape text for JavaScript contexts
function escapeJavaScript(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/'/g, "\\'") // Escape single quotes
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t'); // Escape tabs
}

// Search state for navigation
let currentMatches = [];
let currentMatchIndex = -1;
let lastSearchQuery = '';
let searchDebounceTimer = null;

// Simple search functionality
function focusSearch() {
  const searchContainer = document.getElementById('searchContainer');
  const input = document.getElementById('searchInput');

  if (searchContainer && input) {
    // Show search box
    searchContainer.style.display = 'block';
    // Focus and select text
    input.focus();
    input.select();
  }
}

function closeSearch() {
  const searchContainer = document.getElementById('searchContainer');
  if (searchContainer) {
    // Hide search box
    searchContainer.style.display = 'none';
  }
  // Also clear search
  clearSearch();
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = '';
  }
  // Clear any existing highlights
  const highlights = document.querySelectorAll('.search-highlight');

  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
      parent.removeChild(highlight);
      parent.normalize(); // Merge adjacent text nodes
    }
  });

  // Reset navigation state
  currentMatches = [];
  currentMatchIndex = -1;
  lastSearchQuery = '';
  updateSearchResults();
}

function performSearch() {
  const input = document.getElementById('searchInput');
  if (!input) {
    return;
  }

  const query = input.value.trim();

  if (!query) {
    clearSearch();
    return;
  }

  // Clear previous highlights and reset state
  const highlights = document.querySelectorAll('.search-highlight');

  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
      parent.removeChild(highlight);
      parent.normalize();
    }
  });

  // Reset navigation state
  currentMatches = [];
  currentMatchIndex = -1;

  let matchCount = 0;

  // Find only the code content cells in diff tables
  const codeContentCells = document.querySelectorAll('.br-diff-line-content');

  // Create regex for case-insensitive matching - simpler approach
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, function (match) {
    return '\\' + match;
  });
  const regex = new RegExp('(' + escapedQuery + ')', 'gi');

  // Search and highlight only in code content cells
  codeContentCells.forEach(function (cell) {
    const originalText = cell.textContent || '';
    if (originalText.toLowerCase().includes(query.toLowerCase())) {
      // Get the HTML and replace matches
      const originalHTML = cell.innerHTML;
      const highlightedHTML = originalHTML.replace(regex, function (match) {
        const matchId = 'match-' + matchCount;
        matchCount++;

        // Store match element reference for navigation
        const matchElement =
          '<span class="search-highlight" id="' + matchId + '">' + match + '</span>';

        return matchElement;
      });

      cell.innerHTML = highlightedHTML;
    }
  });

  // After highlighting, collect all match elements for navigation
  const matchElements = document.querySelectorAll('.search-highlight');
  currentMatches = Array.from(matchElements);

  // Store the search query for comparison
  lastSearchQuery = query;

  // Navigate to first match automatically
  if (currentMatches.length > 0) {
    currentMatchIndex = 0;
    highlightCurrentMatch();
    scrollToCurrentMatch();
  }

  // Update results counter
  updateSearchResults();
}

function debouncedSearch() {
  // Clear any existing timer
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  // Set new timer for 300ms delay
  searchDebounceTimer = setTimeout(function () {
    performSearch();
  }, 300);
}

function updateSearchResults() {
  const resultsSpan = document.getElementById('searchResults');
  if (resultsSpan) {
    if (currentMatches.length > 0) {
      resultsSpan.textContent = currentMatchIndex + 1 + ' of ' + currentMatches.length;
    } else {
      resultsSpan.textContent = '0 of 0';
    }
  }
}

function highlightCurrentMatch() {
  // Remove previous current highlight
  const prevCurrent = document.querySelector('.search-highlight.current');
  if (prevCurrent) {
    prevCurrent.classList.remove('current');
  }

  // Add current highlight
  if (currentMatchIndex >= 0 && currentMatchIndex < currentMatches.length) {
    currentMatches[currentMatchIndex].classList.add('current');
  }
}

function scrollToCurrentMatch() {
  if (currentMatchIndex >= 0 && currentMatchIndex < currentMatches.length) {
    const currentMatch = currentMatches[currentMatchIndex];
    currentMatch.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
}

function navigateToNextMatch() {
  if (currentMatches.length === 0) return;

  currentMatchIndex = (currentMatchIndex + 1) % currentMatches.length;
  highlightCurrentMatch();
  scrollToCurrentMatch();
  updateSearchResults();
}

function navigateToPrevMatch() {
  if (currentMatches.length === 0) return;

  currentMatchIndex = currentMatchIndex <= 0 ? currentMatches.length - 1 : currentMatchIndex - 1;
  highlightCurrentMatch();
  scrollToCurrentMatch();
  updateSearchResults();
}

// File operations
function openFile(filePath) {
  vscode.postMessage({
    command: 'openFile',
    filePath: filePath,
  });
}

function copyFileNameToClipboard(filePath) {
  // Use the modern clipboard API if available
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(filePath)
      .then(() => {
        showCopyFeedback();
      })
      .catch(() => {
        // Fallback for older browsers or when clipboard API fails
        fallbackCopyToClipboard(filePath);
      });
  } else {
    // Fallback for older browsers
    fallbackCopyToClipboard(filePath);
  }
}

function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    showCopyFeedback();
  } catch (err) {
    // Silent fail
  }

  document.body.removeChild(textArea);
}

function showCopyFeedback() {
  // Create a temporary tooltip-like feedback
  const feedback = document.createElement('div');
  feedback.textContent = 'Copied!';
  feedback.style.position = 'fixed';
  feedback.style.top = '20px';
  feedback.style.right = '20px';
  feedback.style.backgroundColor = '#28a745';
  feedback.style.color = 'white';
  feedback.style.padding = '8px 12px';
  feedback.style.borderRadius = '4px';
  feedback.style.fontSize = '12px';
  feedback.style.zIndex = '10000';
  feedback.style.opacity = '0';
  feedback.style.transition = 'opacity 0.3s ease';

  document.body.appendChild(feedback);

  // Fade in
  setTimeout(() => {
    feedback.style.opacity = '1';
  }, 10);

  // Fade out and remove
  setTimeout(() => {
    feedback.style.opacity = '0';
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 300);
  }, 1500);
}

// Load existing comments
vscode.postMessage({ command: 'loadComments' });

// Global keybinding for Ctrl+F / Cmd+F
document.addEventListener('keydown', function (event) {
  // Check for Ctrl+F (Windows/Linux) or Cmd+F (Mac)
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault();
    focusSearch();
  }

  // Escape key to close search
  if (event.key === 'Escape') {
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer && searchContainer.style.display !== 'none') {
      closeSearch();
    }
  }
});

// Search event listeners
document.addEventListener('DOMContentLoaded', function () {
  const searchInput = document.getElementById('searchInput');
  const searchNext = document.getElementById('searchNext');
  const searchPrev = document.getElementById('searchPrev');
  const searchClose = document.getElementById('searchClose');

  if (searchInput) {
    // Real-time search with debouncing
    searchInput.addEventListener('input', function (event) {
      const currentQuery = searchInput.value.trim();

      if (!currentQuery) {
        // Empty query - clear immediately
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
        }
        clearSearch();
      } else {
        // Non-empty query - debounced search
        debouncedSearch();
      }
    });

    // Keep Enter key functionality for navigation
    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();

        // Cancel any pending debounced search
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
        }

        const currentQuery = searchInput.value.trim();

        if (event.shiftKey) {
          // Shift+Enter: always navigate previous (if matches exist)
          if (currentMatches.length > 0 && currentQuery === lastSearchQuery) {
            navigateToPrevMatch();
          } else {
            // If query changed or no matches, search first
            performSearch();
          }
        } else {
          // Enter: check if query changed or if we need to search
          if (currentQuery !== lastSearchQuery || currentMatches.length === 0) {
            // Query changed or no current search - perform immediate search
            performSearch();
          } else {
            // Same query and matches exist - navigate to next
            navigateToNextMatch();
          }
        }
      }
    });
  }

  if (searchNext) {
    searchNext.addEventListener('click', navigateToNextMatch);
  }

  if (searchPrev) {
    searchPrev.addEventListener('click', navigateToPrevMatch);
  }

  if (searchClose) {
    searchClose.addEventListener('click', closeSearch);
  }
});

// Listen for messages from extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
    case 'commentsUpdated':
      comments = message.comments;
      updateCommentDisplay();
      break;
    case 'updateLoadingStatus':
      updateLoadingStatus(message.message);
      break;
    case 'hideLoading':
      hideLoading();
      break;
    case 'showError':
      hideLoading();
      showErrorMessage(message.message);
      break;
  }
});

let lastSelectedFile = null;
let lastSelectedLine = null;

function selectLine(filePath, lineNumber, element, event) {
  event.stopPropagation();
  const row = element.closest('tr');
  const actualLineId = row.getAttribute('data-line-id');

  if (event.shiftKey && lastSelectedFile === filePath && lastSelectedLine !== null) {
    // Shift-click: select range
    const startLine = Math.min(lastSelectedLine, lineNumber);
    const endLine = Math.max(lastSelectedLine, lineNumber);

    // Clear previous selections for this file
    selectedLines.forEach(id => {
      if (id.startsWith(filePath + ':')) {
        const prevRow = document.querySelector(`[data-line-id="${id}"]`);
        if (prevRow) prevRow.classList.remove('br-line-selected');
        selectedLines.delete(id);
      }
    });

    // Select the range by finding all rows with line numbers in the range
    for (let i = startLine; i <= endLine; i++) {
      const rangeRows = document.querySelectorAll(
        `[data-line-id="${filePath}:old:${i}"], [data-line-id="${filePath}:new:${i}"]`
      );
      rangeRows.forEach(rangeRow => {
        const rangeLineId = rangeRow.getAttribute('data-line-id');
        selectedLines.add(rangeLineId);
        rangeRow.classList.add('br-line-selected');
      });
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Ctrl/Cmd-click: toggle individual line
    if (selectedLines.has(actualLineId)) {
      selectedLines.delete(actualLineId);
      row.classList.remove('br-line-selected');
    } else {
      selectedLines.add(actualLineId);
      row.classList.add('br-line-selected');
    }
  } else {
    // Regular click: toggle line if already selected, otherwise select only this line
    if (selectedLines.has(actualLineId)) {
      selectedLines.delete(actualLineId);
      row.classList.remove('br-line-selected');
    } else {
      // Clear previous selections for this file
      selectedLines.forEach(id => {
        if (id.startsWith(filePath + ':')) {
          const prevRow = document.querySelector(`[data-line-id="${id}"]`);
          if (prevRow) prevRow.classList.remove('br-line-selected');
          selectedLines.delete(id);
        }
      });

      selectedLines.add(actualLineId);
      row.classList.add('br-line-selected');
    }
  }

  // Update last selected for shift-click reference
  if (selectedLines.has(actualLineId)) {
    lastSelectedFile = filePath;
    lastSelectedLine = lineNumber;
  }
}

function addCommentAtLine(filePath, lineNumber, event) {
  event.stopPropagation();

  // Check if this line exists on the right side (new/changed code)
  const rightSideExists = document.querySelector(`[data-line-id="${filePath}:new:${lineNumber}"]`);
  if (!rightSideExists) {
    console.warn('Cannot comment on line', lineNumber, 'as it does not exist on the new side');
    return;
  }

  // Clear any existing comment forms first
  document.querySelectorAll('.br-comment-form-row').forEach(form => form.remove());

  // Get currently selected lines for this file (only right side for commenting)
  let fileSelectedLines = Array.from(selectedLines)
    .filter(lineId => lineId.startsWith(filePath + ':'))
    .filter(lineId => lineId.includes(':new:')) // Only allow new side for commenting
    .map(lineId => {
      const parts = lineId.split(':');
      // Format is always: file:new:line (since we only allow :new: side)
      return parseInt(parts[2]);
    })
    .sort((a, b) => a - b);

  if (fileSelectedLines.length === 0) {
    // No lines selected, select the clicked line by finding any row with this line number
    const rows = document.querySelectorAll(
      `[data-line-id*="${filePath}:"][data-line-id*=":${lineNumber}"]`
    );
    let lineId = null;
    let row = null;

    // Prefer "new" side if available, otherwise use any available
    for (const candidateRow of rows) {
      const candidateLineId = candidateRow.getAttribute('data-line-id');
      if (candidateLineId.includes(':new:')) {
        lineId = candidateLineId;
        row = candidateRow;
        break;
      } else if (!lineId) {
        lineId = candidateLineId;
        row = candidateRow;
      }
    }

    if (lineId && row) {
      selectedLines.add(lineId);
      row.classList.add('br-line-selected');
      fileSelectedLines = [lineNumber];
    }
  }

  // Generate placeholder text based on selected lines
  let placeholderText;
  if (fileSelectedLines.length === 1) {
    placeholderText = `Add your comment for line ${fileSelectedLines[0]}...`;
  } else {
    const startLine = fileSelectedLines[0];
    const endLine = fileSelectedLines[fileSelectedLines.length - 1];
    placeholderText = `Add your comment for lines ${startLine}-${endLine}...`;
  }

  // Find a row to insert the comment form after (use the last selected line)
  const lastLineNumber = fileSelectedLines[fileSelectedLines.length - 1];

  // Only use the new side for comment insertion (since we're reviewing changes)
  let insertAfterRow = document.querySelector(`[data-line-id="${filePath}:new:${lastLineNumber}"]`);

  if (!insertAfterRow) {
    console.error('New side row not found for line ID. Trying fallback search...');
    // Fallback: find any row with this file and line number on new side only
    insertAfterRow = document.querySelector(`[data-line-id*="${filePath}:new:${lastLineNumber}"]`);

    if (!insertAfterRow) {
      console.error('No row found even with fallback search');
      // Show available data-line-id values for debugging
      const allRows = document.querySelectorAll('[data-line-id]');

      return;
    }
  }

  // Show comment form immediately after the last selected row
  const commentFormRow = document.createElement('tr');
  commentFormRow.className = 'br-comment-form-row';

  // Detect number of columns in the current table row
  const colCount = insertAfterRow.children.length;

  commentFormRow.innerHTML = `
        <td class="br-comment-form-spacer"></td>
        <td class="br-comment-form-spacer"></td>
        <td colspan="2" class="br-comment-form">
            <textarea class="br-comment-textarea" placeholder="${placeholderText}"></textarea>
            <div class="br-comment-actions">
                <button class="br-btn" onclick="cancelComment()">Cancel</button>
                <button class="br-btn br-btn-primary" onclick="submitComment('${filePath}')">Add comment</button>
            </div>
        </td>
    `;

  // Insert after the last selected row
  insertAfterRow.parentNode.insertBefore(commentFormRow, insertAfterRow.nextSibling);

  // Focus the textarea
  const textarea = commentFormRow.querySelector('textarea');
  if (textarea) {
    textarea.focus();
  }
}

function submitComment(filePath) {
  const form = document.querySelector('.br-comment-form');
  if (!form) {
    console.error('No comment form found');
    return;
  }

  const textarea = form.querySelector('textarea');
  if (!textarea) {
    console.error('No textarea found in form');
    return;
  }

  const text = textarea.value.trim();

  if (!text) {
    console.warn('Please enter a comment');
    return;
  }

  // Get selected lines for this file

  const fileLines = Array.from(selectedLines)
    .filter(line => line.startsWith(filePath + ':'))
    .filter(line => line.includes(':new:')) // Only new side lines
    .map(line => parseInt(line.split(':')[2])) // Get line number from file:new:line format
    .sort((a, b) => a - b);

  if (fileLines.length === 0) {
    // If no lines selected, use the line where comment form was opened
    const formRow = form.closest('tr');
    const prevRow = formRow ? formRow.previousElementSibling : null;
    if (prevRow && prevRow.dataset.lineId) {
      const lineId = prevRow.dataset.lineId;
      // Only use if it's a new side line
      if (lineId.includes(':new:')) {
        const lineNumber = parseInt(lineId.split(':')[2]);
        fileLines.push(lineNumber);
      }
    } else {
      console.warn('Please select lines to comment on');
      return;
    }
  }

  const startLine = fileLines[0];
  const endLine = fileLines[fileLines.length - 1];

  // Generate a consistent ID based on file path and line numbers
  const commentId = `${filePath}:${startLine}:${endLine}:${Date.now()}`;

  vscode.postMessage({
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

  // Replace the comment form with a comment display
  const commentDisplay = document.createElement('div');
  commentDisplay.className = 'br-inline-comment';
  commentDisplay.innerHTML = `
        <div class="comment-header">
            <strong>You</strong> commented on lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
        </div>
        <div class="comment-text">${text}</div>
        <div class="comment-actions">
            <button class="br-btn" onclick="editComment('${filePath}', ${startLine}, ${endLine}, '${escapeJavaScript(text)}', this)">✏️ Edit</button>
            <button class="br-btn btn-delete" onclick="deleteInlineComment('${filePath}', ${startLine}, ${endLine}, this)">🗑️ Delete</button>
        </div>
    `;

  // Replace the form with the comment display
  const formRow = form.closest('tr');
  formRow.innerHTML = `
        <td class="br-comment-form-spacer"></td>
        <td class="br-comment-form-spacer"></td>
        <td colspan="2" class="br-inline-comment-cell">${commentDisplay.outerHTML}</td>
    `;
  formRow.className = 'br-comment-display-row';

  // Clear line selection for this comment
  selectedLines.clear();
  document.querySelectorAll('.br-line-selected').forEach(el => {
    el.classList.remove('br-line-selected');
  });
}

function editComment(filePath, startLine, endLine, originalText, buttonElement) {
  // Find the comment display row
  const commentRow = buttonElement.closest('tr');
  const colCount = commentRow.querySelector('td').getAttribute('colspan');

  // Convert back to comment form
  commentRow.className = 'br-comment-form-row';
  commentRow.innerHTML = `
        <td class="br-comment-form-spacer"></td>
        <td class="br-comment-form-spacer"></td>
        <td colspan="2" class="br-comment-form">
            <textarea class="br-comment-textarea" placeholder="Edit your comment...">${originalText}</textarea>
            <div class="br-comment-actions">
                <button class="br-btn" onclick="cancelEdit('${filePath}', ${startLine}, ${endLine}, '${escapeJavaScript(originalText)}', this)">Cancel</button>
                <button class="br-btn br-btn-primary" onclick="updateComment('${filePath}', ${startLine}, ${endLine}, this)">Update comment</button>
            </div>
        </td>
    `;

  // Focus the textarea
  const textarea = commentRow.querySelector('textarea');
  if (textarea) {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length); // Put cursor at end
  }
}

function cancelEdit(filePath, startLine, endLine, originalText, buttonElement) {
  // Convert back to comment display without saving changes
  const commentRow = buttonElement.closest('tr');
  const colCount = commentRow.querySelector('td').getAttribute('colspan');

  commentRow.className = 'br-comment-display-row';
  commentRow.innerHTML = `
        <td class="br-comment-form-spacer"></td>
        <td class="br-comment-form-spacer"></td>
        <td colspan="2" class="br-inline-comment-cell">
            <div class="br-inline-comment">
                <div class="comment-header">
                    <strong>You</strong> commented on lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
                </div>
                <div class="comment-text">${originalText}</div>
                <div class="comment-actions">
                    <button class="br-btn" onclick="editComment('${filePath}', ${startLine}, ${endLine}, '${escapeJavaScript(originalText)}', this)">✏️ Edit</button>
                    <button class="br-btn btn-delete" onclick="deleteInlineComment('${filePath}', ${startLine}, ${endLine}, this)">🗑️ Delete</button>
                </div>
            </div>
        </td>
    `;
}

function updateComment(filePath, startLine, endLine, buttonElement) {
  const commentRow = buttonElement.closest('tr');
  const textarea = commentRow.querySelector('textarea');
  const newText = textarea.value.trim();

  if (!newText) {
    console.warn('Please enter a comment');
    return;
  }

  // Update the stored comment
  vscode.postMessage({
    command: 'updateComment',
    data: {
      filePath,
      startLine,
      endLine,
      text: newText,
      codeSnippet: `Lines ${startLine}-${endLine}`,
    },
  });

  // Convert back to comment display with updated text
  commentRow.className = 'br-comment-display-row';
  commentRow.innerHTML = `
        <td class="br-comment-form-spacer"></td>
        <td class="br-comment-form-spacer"></td>
        <td colspan="2" class="br-inline-comment-cell">
            <div class="br-inline-comment">
                <div class="comment-header">
                    <strong>You</strong> commented on lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
                </div>
                <div class="comment-text">${newText}</div>
                <div class="comment-actions">
                    <button class="br-btn" onclick="editComment('${filePath}', ${startLine}, ${endLine}, '${escapeJavaScript(newText)}', this)">✏️ Edit</button>
                    <button class="br-btn btn-delete" onclick="deleteInlineComment('${filePath}', ${startLine}, ${endLine}, this)">🗑️ Delete</button>
                </div>
            </div>
        </td>
    `;
}

function deleteInlineComment(filePath, startLine, endLine, buttonElement) {
  // Remove the comment from storage
  vscode.postMessage({
    command: 'deleteComment',
    data: {
      filePath,
      startLine,
      endLine,
    },
  });

  // Remove the comment display row
  const commentRow = buttonElement.closest('tr');
  commentRow.remove();
}

function cancelComment() {
  document.querySelectorAll('.br-comment-form-row').forEach(form => form.remove());
  selectedLines.clear();
  document.querySelectorAll('.br-line-selected').forEach(el => {
    el.classList.remove('br-line-selected');
  });
}

function getCodeSnippet(filePath, startLine, endLine) {
  // This is a simplified implementation
  // In a real implementation, you'd extract the actual code lines
  return `Lines ${startLine}-${endLine}`;
}

function updateCommentDisplay() {
  // Since we're using inline comments now, we need to display them
  // directly in the diff view where each comment was added
  comments.forEach(comment => {
    // For each comment, find its corresponding inline display
    const lineIds = comment.lineNumbers;
    if (lineIds && lineIds.length > 0) {
      // Find the last selected line to show the comment after it
      const lastLineId = lineIds[lineIds.length - 1];
      const row = document.querySelector(`tr[data-line-id="${lastLineId}"]`);
      if (row) {
        // Check if comment is already displayed
        const existingComment = row.nextElementSibling;
        if (existingComment && existingComment.classList.contains('br-comment-row')) {
          // Update existing comment
          const commentBox = existingComment.querySelector('.br-comment-box');
          if (commentBox) {
            commentBox.querySelector('.br-comment-text').textContent = comment.text;
          }
        } else {
          // Create new comment display
          showInlineComment(lastLineId, comment.text, comment.id);
        }
      }
    }
  });
}

// Removed toggleDiffView - only using split view now

function changeBranch(newBaseBranch) {
  vscode.postMessage({
    command: 'changeBranch',
    data: { baseBranch: newBaseBranch },
  });
}

function refreshDiff() {
  vscode.postMessage({
    command: 'refreshDiff',
  });
}

function deleteComment(commentId) {
  vscode.postMessage({
    command: 'deleteComment',
    data: { id: commentId },
  });
}

function submitComments() {
  if (comments.length === 0) {
    console.warn(
      'No comments to submit. Please add some comments first by selecting lines and typing feedback.'
    );
    return;
  }

  // Use the extension's submit command instead
  vscode.postMessage({
    command: 'submitComments',
  });
}

// Branch dropdown functionality
let allBranches = [];
let currentBaseBranch = '';

function initializeBranchDropdown() {
  // Extract branches from the dropdown content
  const dropdownList = document.getElementById('branchDropdownList');
  if (dropdownList) {
    const options = dropdownList.querySelectorAll('.branch-dropdown-item');
    allBranches = Array.from(options).map(option => option.textContent.trim());

    // Set initial value if available
    const selectedOption = dropdownList.querySelector('.branch-dropdown-item.selected');
    if (selectedOption) {
      currentBaseBranch = selectedOption.textContent.trim();
      document.getElementById('branchSearchInput').value = currentBaseBranch;
    }
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', function (event) {
    const container = document.querySelector('.branch-dropdown-container');
    if (container && !container.contains(event.target)) {
      hideBranchDropdown();
    }
  });
}

function showBranchDropdown() {
  const input = document.getElementById('branchSearchInput');
  const dropdown = document.getElementById('branchDropdownList');

  // Make input editable for searching
  input.readOnly = false;
  input.focus();

  // Select all text so user can immediately type
  input.select();

  // Show all options initially
  filterBranchOptions('');
  dropdown.style.display = 'block';

  // Add search functionality
  input.oninput = function () {
    filterBranchOptions(this.value);
  };

  // Handle keyboard navigation
  input.onkeydown = function (e) {
    const items = dropdown.querySelectorAll(
      '.branch-dropdown-item:not([style*=\"display: none\"])'
    );
    const selected = dropdown.querySelector('.branch-dropdown-item.selected');
    let selectedIndex = Array.from(items).indexOf(selected);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      selectDropdownItem(items[selectedIndex]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      selectDropdownItem(items[selectedIndex]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selected) {
        chooseBranch(selected.textContent.trim());
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideBranchDropdown();
    }
  };
}

function hideBranchDropdown() {
  const input = document.getElementById('branchSearchInput');
  const dropdown = document.getElementById('branchDropdownList');

  dropdown.style.display = 'none';
  input.readOnly = true;
  input.value = currentBaseBranch;
  input.onkeydown = null;
  input.oninput = null;
}

function filterBranchOptions(searchTerm) {
  const dropdown = document.getElementById('branchDropdownList');
  const items = dropdown.querySelectorAll('.branch-dropdown-item');

  items.forEach(item => {
    const branchName = item.textContent.trim().toLowerCase();
    const matches = branchName.includes(searchTerm.toLowerCase());
    item.style.display = matches ? 'block' : 'none';
  });

  // Select first visible item
  const firstVisible = dropdown.querySelector(
    '.branch-dropdown-item:not([style*=\"display: none\"])'
  );
  if (firstVisible) {
    selectDropdownItem(firstVisible);
  }
}

function selectDropdownItem(item) {
  const dropdown = document.getElementById('branchDropdownList');
  dropdown.querySelectorAll('.branch-dropdown-item').forEach(i => i.classList.remove('selected'));
  item.classList.add('selected');
}

function chooseBranch(branchName) {
  currentBaseBranch = branchName;
  document.getElementById('branchSearchInput').value = branchName;
  hideBranchDropdown();
  changeBranch(branchName);
}

// Loading state functions
function showLoading(message = 'Initializing Git operations...') {
  document.getElementById('loadingState').style.display = 'flex';
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('loadingStatus').textContent = message;
}

function hideLoading() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
}

function updateLoadingStatus(message) {
  const statusElement = document.getElementById('loadingStatus');
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function showErrorMessage(message) {
  const mainContent = document.getElementById('mainContent');
  mainContent.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #d73a49;">
            <h3>⚠️ Unable to Load Review</h3>
            <p style="margin: 16px 0; color: #586069;">${message}</p>
            <button class="br-btn br-btn-primary" onclick="location.reload()" style="margin-top: 16px;">
                Try Again
            </button>
        </div>
    `;
}

// Initialize dropdown when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBranchDropdown);
} else {
  initializeBranchDropdown();
}
