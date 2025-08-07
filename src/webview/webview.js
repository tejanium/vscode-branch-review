const vscode = acquireVsCodeApi();
let comments = [];
let selectedLines = new Set();

// Load existing comments
vscode.postMessage({ command: 'loadComments' });

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
                if (prevRow) prevRow.classList.remove('gh-line-selected');
                selectedLines.delete(id);
            }
        });

        // Select the range by finding all rows with line numbers in the range
        for (let i = startLine; i <= endLine; i++) {
            const rangeRows = document.querySelectorAll(`[data-line-id="${filePath}:old:${i}"], [data-line-id="${filePath}:new:${i}"]`);
            rangeRows.forEach(rangeRow => {
                const rangeLineId = rangeRow.getAttribute('data-line-id');
                selectedLines.add(rangeLineId);
                rangeRow.classList.add('gh-line-selected');
            });
        }

    } else if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd-click: toggle individual line
        if (selectedLines.has(actualLineId)) {
            selectedLines.delete(actualLineId);
            row.classList.remove('gh-line-selected');
        } else {
            selectedLines.add(actualLineId);
            row.classList.add('gh-line-selected');
        }

    } else {
        // Regular click: toggle line if already selected, otherwise select only this line
        if (selectedLines.has(actualLineId)) {
            selectedLines.delete(actualLineId);
            row.classList.remove('gh-line-selected');
        } else {
            // Clear previous selections for this file
            selectedLines.forEach(id => {
                if (id.startsWith(filePath + ':')) {
                    const prevRow = document.querySelector(`[data-line-id="${id}"]`);
                    if (prevRow) prevRow.classList.remove('gh-line-selected');
                    selectedLines.delete(id);
                }
            });

            selectedLines.add(actualLineId);
            row.classList.add('gh-line-selected');
        }
    }

    // Update last selected for shift-click reference
    if (selectedLines.has(actualLineId)) {
        lastSelectedFile = filePath;
        lastSelectedLine = lineNumber;
    }

    console.log('Selected lines:', Array.from(selectedLines));
}

function addCommentAtLine(filePath, lineNumber, event) {
    console.log('addCommentAtLine called:', filePath, lineNumber);
    event.stopPropagation();

    // Check if this line exists on the right side (new/changed code)
    const rightSideExists = document.querySelector(`[data-line-id="${filePath}:new:${lineNumber}"]`);
    if (!rightSideExists) {
        console.warn('Cannot comment on line', lineNumber, 'as it does not exist on the new side');
        return;
    }

    // Clear any existing comment forms first
    document.querySelectorAll('.gh-comment-form-row').forEach(form => form.remove());

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
        const rows = document.querySelectorAll(`[data-line-id*="${filePath}:"][data-line-id*=":${lineNumber}"]`);
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
            row.classList.add('gh-line-selected');
            fileSelectedLines = [lineNumber];
        }
    }

    console.log('Selected lines for comment:', fileSelectedLines);

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

    console.log('Looking for new side line ID:', `${filePath}:new:${lastLineNumber}`);

    if (!insertAfterRow) {
        console.error('New side row not found for line ID. Trying fallback search...');
        // Fallback: find any row with this file and line number on new side only
        insertAfterRow = document.querySelector(`[data-line-id*="${filePath}:new:${lastLineNumber}"]`);

        if (!insertAfterRow) {
            console.error('No row found even with fallback search');
            // Show available data-line-id values for debugging
            const allRows = document.querySelectorAll('[data-line-id]');
            console.log('Available data-line-id values:', Array.from(allRows).map(r => r.getAttribute('data-line-id')).slice(0, 10));
            return;
        }
    }

    // Show comment form immediately after the last selected row
    const commentFormRow = document.createElement('tr');
    commentFormRow.className = 'gh-comment-form-row';

    // Detect number of columns in the current table row
    const colCount = insertAfterRow.children.length;
    console.log('Column count for comment form:', colCount);

    commentFormRow.innerHTML = `
        <td colspan="${colCount}" class="gh-comment-form">
            <textarea class="gh-comment-textarea" placeholder="${placeholderText}"></textarea>
            <div class="gh-comment-actions">
                <button class="gh-btn" onclick="cancelComment()">Cancel</button>
                <button class="gh-btn gh-btn-primary" onclick="submitComment('${filePath}')">Add comment</button>
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
    console.log('submitComment called for:', filePath);
    const form = document.querySelector('.gh-comment-form');
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
    console.log('Comment text:', text);

    if (!text) {
        console.warn('Please enter a comment');
        return;
    }

    // Get selected lines for this file
    console.log('Current selectedLines:', Array.from(selectedLines));
    const fileLines = Array.from(selectedLines)
        .filter(line => line.startsWith(filePath + ':'))
        .filter(line => line.includes(':new:')) // Only new side lines
        .map(line => parseInt(line.split(':')[2])) // Get line number from file:new:line format
        .sort((a, b) => a - b);

    console.log('Filtered file lines:', fileLines);

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
                console.log('Using line from form context:', lineNumber);
            }
        } else {
            console.warn('Please select lines to comment on');
            return;
        }
    }

    const startLine = fileLines[0];
    const endLine = fileLines[fileLines.length - 1];

    console.log('Sending comment:', { filePath, startLine, endLine, text });

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
            timestamp: new Date().toISOString()
        }
    });

    // Replace the comment form with a comment display
    const commentDisplay = document.createElement('div');
    commentDisplay.className = 'gh-inline-comment';
    commentDisplay.innerHTML = `
        <div class="comment-header">
            <strong>You</strong> commented on lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
        </div>
        <div class="comment-text">${text}</div>
        <div class="comment-actions">
            <button class="gh-btn" onclick="editComment('${filePath}', ${startLine}, ${endLine}, '${text.replace(/'/g, "\\'")}', this)">✏️ Edit</button>
            <button class="gh-btn btn-delete" onclick="deleteInlineComment('${filePath}', ${startLine}, ${endLine}, this)">🗑️ Delete</button>
        </div>
    `;

    // Replace the form with the comment display
    const formRow = form.closest('tr');
    formRow.innerHTML = `<td colspan="${formRow.querySelector('td').getAttribute('colspan')}" class="gh-inline-comment-cell">${commentDisplay.outerHTML}</td>`;
    formRow.className = 'gh-comment-display-row';

    // Clear line selection for this comment
    selectedLines.clear();
    document.querySelectorAll('.gh-line-selected').forEach(el => {
        el.classList.remove('gh-line-selected');
    });
}

function editComment(filePath, startLine, endLine, originalText, buttonElement) {
    console.log('editComment called:', filePath, startLine, endLine, originalText);

    // Find the comment display row
    const commentRow = buttonElement.closest('tr');
    const colCount = commentRow.querySelector('td').getAttribute('colspan');

    // Convert back to comment form
    commentRow.className = 'gh-comment-form-row';
    commentRow.innerHTML = `
        <td colspan="${colCount}" class="gh-comment-form">
            <textarea class="gh-comment-textarea" placeholder="Edit your comment...">${originalText}</textarea>
            <div class="gh-comment-actions">
                <button class="gh-btn" onclick="cancelEdit('${filePath}', ${startLine}, ${endLine}, '${originalText.replace(/'/g, "\\'")}', this)">Cancel</button>
                <button class="gh-btn gh-btn-primary" onclick="updateComment('${filePath}', ${startLine}, ${endLine}, this)">Update comment</button>
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

    commentRow.className = 'gh-comment-display-row';
    commentRow.innerHTML = `
        <td colspan="${colCount}" class="gh-inline-comment-cell">
            <div class="gh-inline-comment">
                <div class="comment-header">
                    <strong>You</strong> commented on lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
                </div>
                <div class="comment-text">${originalText}</div>
                <div class="comment-actions">
                    <button class="gh-btn" onclick="editComment('${filePath}', ${startLine}, ${endLine}, '${originalText.replace(/'/g, "\\'")}', this)">✏️ Edit</button>
                    <button class="gh-btn btn-delete" onclick="deleteInlineComment('${filePath}', ${startLine}, ${endLine}, this)">🗑️ Delete</button>
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
            codeSnippet: `Lines ${startLine}-${endLine}`
        }
    });

    // Convert back to comment display with updated text
    const colCount = commentRow.querySelector('td').getAttribute('colspan');
    commentRow.className = 'gh-comment-display-row';
    commentRow.innerHTML = `
        <td colspan="${colCount}" class="gh-inline-comment-cell">
            <div class="gh-inline-comment">
                <div class="comment-header">
                    <strong>You</strong> commented on lines ${startLine}${startLine !== endLine ? `-${endLine}` : ''}
                </div>
                <div class="comment-text">${newText}</div>
                <div class="comment-actions">
                    <button class="gh-btn" onclick="editComment('${filePath}', ${startLine}, ${endLine}, '${newText.replace(/'/g, "\\'")}', this)">✏️ Edit</button>
                    <button class="gh-btn btn-delete" onclick="deleteInlineComment('${filePath}', ${startLine}, ${endLine}, this)">🗑️ Delete</button>
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
            endLine
        }
    });

    // Remove the comment display row
    const commentRow = buttonElement.closest('tr');
    commentRow.remove();
}

function cancelComment() {
    document.querySelectorAll('.gh-comment-form-row').forEach(form => form.remove());
    selectedLines.clear();
    document.querySelectorAll('.gh-line-selected').forEach(el => {
        el.classList.remove('gh-line-selected');
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
                if (existingComment && existingComment.classList.contains('gh-comment-row')) {
                    // Update existing comment
                    const commentBox = existingComment.querySelector('.gh-comment-box');
                    if (commentBox) {
                        commentBox.querySelector('.gh-comment-text').textContent = comment.text;
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
    console.log('changeBranch called with:', newBaseBranch);
    console.log('vscode object:', typeof vscode);
    vscode.postMessage({
        command: 'changeBranch',
        data: { baseBranch: newBaseBranch }
    });
}

function refreshDiff() {
    console.log('Refreshing diff...');
    vscode.postMessage({
        command: 'refreshDiff'
    });
}

function deleteComment(commentId) {
    console.log('Deleting comment:', commentId);
    vscode.postMessage({
        command: 'deleteComment',
        data: { id: commentId }
    });
}

function submitComments() {
    console.log('Submit button clicked!');
    console.log('Current comments:', comments);

    if (comments.length === 0) {
        console.warn('No comments to submit. Please add some comments first by selecting lines and typing feedback.');
        return;
    }

    // Use the extension's submit command instead
    vscode.postMessage({
        command: 'submitComments'
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
    document.addEventListener('click', function(event) {
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
    input.oninput = function() {
        filterBranchOptions(this.value);
    };

    // Handle keyboard navigation
    input.onkeydown = function(e) {
        const items = dropdown.querySelectorAll('.branch-dropdown-item:not([style*=\"display: none\"])');
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
    const firstVisible = dropdown.querySelector('.branch-dropdown-item:not([style*=\"display: none\"])');
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
            <button class="gh-btn gh-btn-primary" onclick="location.reload()" style="margin-top: 16px;">
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
