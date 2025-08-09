// Branch Controller - Simple searchable dropdown
import { Controller } from 'stimulus';

export default class BranchController extends Controller {
  static targets = ['input', 'dropdown', 'list', 'searchInput'];
  static values = {
    branches: Array,
    selected: String,
    current: String,
  };

  // Truncate branch name in the middle for long names
  truncateMiddle(str, maxLength = 30) {
    if (str.length <= maxLength) return str;
    const start = Math.ceil(maxLength / 2) - 1;
    const end = Math.floor(maxLength / 2) - 2;
    return str.substring(0, start) + '...' + str.substring(str.length - end);
  }

  connect() {
    // Filter out current branch from available branches
    const availableBranches = (this.branchesValue || []).filter(
      branch => branch !== this.currentValue
    );
    this.filteredBranches = availableBranches;
    this.isOpen = false;
    this.highlightedIndex = -1; // Track highlighted item for keyboard navigation

    // Set initial display value with truncation
    if (this.hasInputTarget && this.selectedValue) {
      this.inputTarget.value = this.truncateMiddle(this.selectedValue, 25);
      this.inputTarget.title = this.selectedValue;
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', this.handleOutsideClick);
  }

  disconnect() {
    document.removeEventListener('click', this.handleOutsideClick);
  }

  // Toggle dropdown open/closed
  toggle(event) {
    event.stopPropagation();

    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    this.dropdownTarget.style.display = 'block';
    this.inputTarget.classList.add('active');

    // Focus search input and select all text for immediate typing
    setTimeout(() => {
      if (this.hasSearchInputTarget) {
        this.searchInputTarget.focus();
        this.searchInputTarget.select();
      }
    }, 50);

    this.renderBranches();
  }

  close() {
    this.isOpen = false;
    this.dropdownTarget.style.display = 'none';
    this.inputTarget.classList.remove('active');
    this.highlightedIndex = -1; // Reset highlighted index

    // Reset search
    if (this.hasSearchInputTarget) {
      this.searchInputTarget.value = '';
    }
    // Reset to available branches (excluding current branch)
    const availableBranches = (this.branchesValue || []).filter(
      branch => branch !== this.currentValue
    );
    this.filteredBranches = availableBranches;
  }

  // Handle search input
  search(event) {
    const query = event.target.value.toLowerCase().trim();

    // Always exclude current branch from available options
    const availableBranches = (this.branchesValue || []).filter(
      branch => branch !== this.currentValue
    );

    if (query === '') {
      this.filteredBranches = availableBranches;
    } else {
      this.filteredBranches = availableBranches.filter(branch =>
        branch.toLowerCase().includes(query)
      );
    }

    // Auto-highlight first match when search results change
    this.highlightedIndex = this.filteredBranches.length > 0 ? 0 : -1;
    this.renderBranches();
  }

  // Handle keyboard navigation in search input
  handleKeydown(event) {
    if (!this.isOpen) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Enter':
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.filteredBranches[this.highlightedIndex]) {
          this.selectBranchByName(this.filteredBranches[this.highlightedIndex]);
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.navigateDown();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateUp();
        break;
    }
  }

  // Navigate down in the list
  navigateDown() {
    if (this.filteredBranches.length === 0) return;
    this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredBranches.length - 1);
    this.renderBranches();
    this.scrollToHighlighted();
  }

  // Navigate up in the list
  navigateUp() {
    if (this.filteredBranches.length === 0) return;
    this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
    this.renderBranches();
    this.scrollToHighlighted();
  }

  // Scroll highlighted item into view
  scrollToHighlighted() {
    if (this.highlightedIndex < 0) return;
    const highlightedElement = this.listTarget.children[this.highlightedIndex];
    if (highlightedElement) {
      highlightedElement.scrollIntoView({ block: 'nearest' });
    }
  }

  // Select a branch by name (helper method)
  selectBranchByName(branchName) {
    this.selectedValue = branchName;
    this.inputTarget.value = this.truncateMiddle(branchName, 25);
    this.inputTarget.title = branchName;
    this.close();

    // Show immediate loading feedback by finding the app controller
    const appController = this.application.getControllerForElementAndIdentifier(
      document.body,
      'app'
    );
    if (appController) {
      appController.showLoading();
      appController.updateLoadingStatus(`Switching to compare with ${branchName}...`);
    }

    // Notify the extension
    window.vscode.postMessage({
      command: 'changeBranch',
      data: { baseBranch: branchName },
    });
  }

  // Select a branch (click handler)
  selectBranch(event) {
    const branchName = event.currentTarget.dataset.branch;
    this.selectBranchByName(branchName);
  }

  // Handle clicks outside dropdown - arrow function as class property
  handleOutsideClick = event => {
    if (!this.element.contains(event.target)) {
      this.close();
    }
  };

  // Render filtered branches
  renderBranches() {
    if (!this.hasListTarget) return;

    // Safety check for filteredBranches
    if (!this.filteredBranches || !Array.isArray(this.filteredBranches)) {
      this.filteredBranches = [];
    }

    const html = this.filteredBranches
      .map((branch, index) => {
        const displayName = this.truncateMiddle(branch);
        const isSelected = branch === this.selectedValue;
        const isHighlighted = index === this.highlightedIndex;

        let cssClasses = 'branch-item';
        if (isSelected) cssClasses += ' selected';
        if (isHighlighted) cssClasses += ' highlighted';

        return `
        <div
          class="${cssClasses}"
          data-branch="${branch}"
          data-action="click->branch#selectBranch"
          title="${branch}"
        >
          <svg class="branch-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>
          </svg>
          <span class="branch-name">${displayName}</span>
          ${isSelected ? '<svg class="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>' : ''}
        </div>
      `;
      })
      .join('');

    this.listTarget.innerHTML = html;

    // Show "no results" message if no branches found
    if (this.filteredBranches.length === 0) {
      this.listTarget.innerHTML = '<div class="no-results">No branches found</div>';
      this.highlightedIndex = -1;
    }
  }
}
