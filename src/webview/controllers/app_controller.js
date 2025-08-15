// App Controller - Main application controller for global functionality ONLY
import { Controller } from 'stimulus';
import { EVENTS, dispatchCustomEvent } from '../events.js';

export default class AppController extends Controller {
  static targets = [
    'mainContent',
    'loadingState',
    'deleteAllButton',
    'submitButton',
    'refreshButton',
    'warningRow',
    'warningText',
  ];
  static values = {};

  // Class field arrow function - automatically binds `this`
  handleMessage = event => {
    const message = event.data;
    switch (message.command) {
      case 'commentsUpdated':
        window.commentStorage = message.comments || [];
        // Update button states based on comment count
        this.updateButtonStates();
        // Trigger comment display via Stimulus action
        dispatchCustomEvent(document.body, EVENTS.COMMENTS.UPDATED, {
          comments: window.commentStorage,
        });
        break;
      case 'updateLoadingStatus':
        this.showLoading();
        this.updateLoadingStatus(message.message);
        break;
      case 'hideLoading':
        this.hideLoading();
        break;
      case 'showError':
        this.hideLoading();
        this.showErrorMessage(message.message);
        break;
      case 'showWarning':
        this.showWarningMessage(message.message);
        break;
      case 'updateDiffStats':
        this.updateDiffStats(message.data);
        break;
    }
  };

  connect() {
    // Initialize app state
    this.initializeEventListeners();

    // Check if we should show loading state on initial load
    this.checkInitialLoadingState();

    // Set initial button states
    this.updateButtonStates();
  }

  checkInitialLoadingState() {
    // Try with Stimulus targets first
    if (this.hasMainContentTarget && this.hasLoadingStateTarget) {
      const mainContent = this.mainContentTarget.innerHTML.trim();
      if (!mainContent || mainContent === '') {
        this.showLoading();
        return;
      }
    }

    // Fallback: try with direct DOM selection
    const loadingElement = document.getElementById('loadingState');
    const mainElement = document.getElementById('mainContent');

    if (loadingElement && mainElement) {
      const mainContent = mainElement.innerHTML.trim();
      if (!mainContent || mainContent === '') {
        loadingElement.style.display = 'block';
        mainElement.style.display = 'none';
      }
    }
  }

  showLoading() {
    if (this.hasLoadingStateTarget) {
      this.loadingStateTarget.style.display = 'block';
    }
    if (this.hasMainContentTarget) {
      this.mainContentTarget.style.display = 'none';
    }
    // Disable refresh button during loading
    if (this.hasRefreshButtonTarget) {
      this.refreshButtonTarget.disabled = true;
    }
  }

  // Stimulus action to handle comments updated from document
  handleCommentsUpdated(event) {
    // Forward the event to all comment controllers by dispatching on tables
    document.querySelectorAll('table[data-controller*="comment"]').forEach(table => {
      dispatchCustomEvent(table, EVENTS.COMMENTS.UPDATED_FORWARDED, event.detail);
    });
  }

  initializeEventListeners() {
    // Listen for messages from extension
    window.addEventListener('message', this.handleMessage);
  }

  refreshDiff() {
    // Show full loading screen during refresh
    this.showLoading();
    this.updateLoadingStatus('Refreshing branch review...');

    window.vscode.postMessage({ command: 'refreshDiff' });
  }

  submitComments() {
    window.vscode.postMessage({
      command: 'submitComments',
      comments: window.commentStorage,
      timestamp: new Date().toISOString(),
    });
  }

  updateLoadingStatus(message) {
    const statusElement = document.getElementById('loadingStatus');
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  hideLoading() {
    if (this.hasLoadingStateTarget) {
      this.loadingStateTarget.style.display = 'none';
    }
    if (this.hasMainContentTarget) {
      this.mainContentTarget.style.display = 'block';
    }
    // Re-enable refresh button after loading
    if (this.hasRefreshButtonTarget) {
      this.refreshButtonTarget.disabled = false;
    }
  }

  showErrorMessage(message) {
    // Create a better error toast instead of alert
    const errorDiv = document.createElement('div');
    errorDiv.className = 'br-error-toast';
    errorDiv.innerHTML = `
      <div class="br-error-content">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 8px; color: #d73a49;">
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.326-2.676a.75.75 0 0 0-1.06 1.06L6.94 8l-2.174 2.176a.75.75 0 1 0 1.06 1.06L8 9.06l2.176 2.176a.75.75 0 1 0 1.06-1.06L9.06 8l2.176-2.676a.75.75 0 0 0-1.06-1.06L8 6.94 5.824 4.324Z"/>
        </svg>
        <span>${message}</span>
        <button class="br-error-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;

    document.body.appendChild(errorDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 5000);
  }

    showWarningMessage(message) {
    // Show warning in the header instead of a popup toast
    if (this.hasWarningTextTarget && this.hasWarningRowTarget) {
      this.warningTextTarget.textContent = message;
      this.warningRowTarget.style.display = 'flex';
    }
  }

  hideWarningMessage() {
    // Hide the header warning message
    if (this.hasWarningRowTarget) {
      this.warningRowTarget.style.display = 'none';
    }
  }



  deleteAllComments() {
    // Immediately clear all comment displays from the UI
    document.querySelectorAll('.br-comment-display-row').forEach(row => row.remove());

    // Also clear the backend storage
    window.vscode.postMessage({
      command: 'deleteAllComments',
    });
  }

  updateButtonStates() {
    const hasComments = window.commentStorage && window.commentStorage.length > 0;

    // Enable/disable buttons based on comment count
    if (this.hasDeleteAllButtonTarget) {
      this.deleteAllButtonTarget.disabled = !hasComments;
    }

    if (this.hasSubmitButtonTarget) {
      this.submitButtonTarget.disabled = !hasComments;
    }
  }

  updateDiffStats(statsData) {
    // Find the diff stats element and update it
    const diffStatsElement = document.querySelector('.br-diff-stats');
    if (diffStatsElement && statsData) {
      const statsHtml = `<span style="color: #1a7f37; font-weight: bold;">+${statsData.added}</span> <span style="color: #d1242f; font-weight: bold;">-${statsData.removed}</span>`;
      diffStatsElement.innerHTML = statsHtml;
    }
  }
}
