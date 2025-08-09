// Search Controller - Handles search functionality
import { Controller } from 'stimulus';

export default class SearchController extends Controller {
  static targets = ['input', 'results', 'container', 'searchableContent'];
  static values = {
    currentIndex: Number,
    totalMatches: Number,
    query: String,
  };

  // Class field arrow function - automatically binds `this`
  handleGlobalKeydown = event => {
    // Ctrl+F or Cmd+F to focus search
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      event.preventDefault();
      this.focus();
    }
  };

  connect() {
    this.currentMatches = [];
    this.searchDebounceTimer = null;
    this.lastSearchQuery = '';
    // Global keyboard shortcuts now handled declaratively via data-action
  }

  disconnect() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    // Event listeners now handled declaratively via data-action
  }

  focus() {
    this.containerTarget.style.display = 'block';
    this.inputTarget.focus();
    this.inputTarget.select();
  }

  close() {
    this.containerTarget.style.display = 'none';
    this.clearHighlights();
  }

  clear() {
    this.inputTarget.value = '';
    this.clearHighlights();
    this.updateResults();
  }

  search() {
    const query = this.inputTarget.value.trim();

    if (!query) {
      this.clearHighlights();
      this.updateResults();
      return;
    }

    // Debounce search for real-time typing
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.performSearch(query);
    }, 300);
  }

  searchOnEnter(event) {
    if (event.key === 'Enter') {
      // Clear debounce timer if user presses Enter
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }

      const query = this.inputTarget.value.trim();

      if (event.shiftKey) {
        this.navigateToPrevMatch();
      } else {
        // Check if this is a new search or navigation
        if (query !== this.lastSearchQuery) {
          this.performSearch(query);
        } else if (this.currentMatches.length > 0) {
          this.navigateToNextMatch();
        }
      }
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  performSearch(query) {
    this.lastSearchQuery = query;
    this.clearHighlights();

    const codeContentCells = this.searchableContentTargets;
    this.currentMatches = [];
    let matchCount = 0;

    const escapedQuery = this.escapeRegex(query);
    const regex = new RegExp(escapedQuery, 'gi');

    codeContentCells.forEach((cell, cellIndex) => {
      const codeElement = cell.querySelector('pre');
      if (codeElement) {
        const originalText = codeElement.textContent;
        let match;

        while ((match = regex.exec(originalText)) !== null) {
          matchCount++;
          this.currentMatches.push({
            element: codeElement,
            text: match[0],
            index: match.index,
          });
        }

        // Reset regex for highlighting pass
        regex.lastIndex = 0;

        // If we found matches in this cell, highlight them
        if (originalText.match(new RegExp(escapedQuery, 'gi'))) {
          const highlightedText = originalText.replace(
            new RegExp(escapedQuery, 'gi'),
            function (match) {
              return '<span class="search-highlight">' + match + '</span>';
            }
          );

          codeElement.innerHTML = highlightedText;
        }
      }
    });

    this.currentIndexValue = this.currentMatches.length > 0 ? 0 : -1;
    this.totalMatchesValue = matchCount;
    this.updateResults();

    if (this.currentMatches.length > 0) {
      this.highlightCurrentMatch();
      this.scrollToCurrentMatch();
    }
  }

  navigateToNextMatch() {
    if (this.currentMatches.length === 0) return;

    this.currentIndexValue = (this.currentIndexValue + 1) % this.currentMatches.length;
    this.updateResults();
    this.highlightCurrentMatch();
    this.scrollToCurrentMatch();
  }

  navigateToPrevMatch() {
    if (this.currentMatches.length === 0) return;

    this.currentIndexValue =
      this.currentIndexValue <= 0 ? this.currentMatches.length - 1 : this.currentIndexValue - 1;
    this.updateResults();
    this.highlightCurrentMatch();
    this.scrollToCurrentMatch();
  }

  updateResults() {
    if (this.currentMatches.length === 0) {
      this.resultsTarget.textContent = '0 of 0';
    } else {
      this.resultsTarget.textContent = `${this.currentIndexValue + 1} of ${this.totalMatchesValue}`;
    }
  }

  highlightCurrentMatch() {
    // Remove previous current highlight using targets
    this.getAllHighlights().forEach(el => {
      el.classList.remove('current');
    });

    // Add current highlight to active match
    if (this.currentIndexValue >= 0 && this.currentMatches[this.currentIndexValue]) {
      // Find the global highlight element that corresponds to this match index
      const allHighlights = this.getAllHighlights();

      if (allHighlights[this.currentIndexValue]) {
        allHighlights[this.currentIndexValue].classList.add('current');
      }
    }
  }

  // Helper method to get all highlights using targets instead of document.querySelectorAll
  getAllHighlights() {
    const highlights = [];
    this.searchableContentTargets.forEach(cell => {
      const cellHighlights = cell.querySelectorAll('.search-highlight');
      highlights.push(...cellHighlights);
    });
    return highlights;
  }

  scrollToCurrentMatch() {
    if (this.currentIndexValue >= 0 && this.currentMatches[this.currentIndexValue]) {
      const currentMatch = this.currentMatches[this.currentIndexValue];
      currentMatch.element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }

  clearHighlights() {
    // Use targets to find highlights within searchable content
    this.searchableContentTargets.forEach(cell => {
      const highlights = cell.querySelectorAll('.search-highlight');
      highlights.forEach(highlight => {
        const parent = highlight.parentNode;
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
      });
    });

    this.currentMatches = [];
    this.currentIndexValue = -1;
    this.totalMatchesValue = 0;
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, function (match) {
      return '\\' + match;
    });
  }

  clear() {
    this.inputTarget.value = '';
    this.clearHighlights();
    this.queryValue = '';
    this.lastSearchQuery = '';
  }

  close() {
    this.clear();
    if (this.hasContainerTarget) {
      this.containerTarget.style.display = 'none';
    }
  }
}
