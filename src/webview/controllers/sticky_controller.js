// Sticky Controller - Handles sticky header positioning
import { Controller } from 'stimulus';

export default class StickyController extends Controller {
  static targets = ['header'];

  connect() {
    this.updateStickyPositions();
    this.setupEventListeners();
  }

  disconnect() {
    this.removeEventListeners();
  }

  // Arrow function as class property - automatically binds `this`
  resizeHandler = () => {
    this.updateStickyPositions();
  };

  // Arrow function as class property for mutation observer callback
  mutationHandler = () => {
    setTimeout(() => this.updateStickyPositions(), 50);
  };

  // Arrow function as class property for scroll handler
  scrollHandler = () => {
    this.updateFileHeaderStyles();
  };

  setupEventListeners() {
    // Update on window resize
    window.addEventListener('resize', this.resizeHandler);

    // Update on scroll to handle sticky header appearance
    window.addEventListener('scroll', this.scrollHandler);

    // Update when content changes (e.g., after diff load)
    this.observer = new MutationObserver(this.mutationHandler);

    // Observe the main content area for changes
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
      this.observer.observe(mainContent, {
        childList: true,
        subtree: true,
      });
    }
  }

  removeEventListeners() {
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('scroll', this.scrollHandler);
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  updateStickyPositions() {
    if (!this.hasHeaderTarget) return;

    const headerHeight = this.headerTarget.offsetHeight;

    // Update CSS custom property so file headers stick below main header
    document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);

    // Also update file header styles on position change
    this.updateFileHeaderStyles();
  }

  updateFileHeaderStyles() {
    if (!this.hasHeaderTarget) return;

    const headerHeight = this.headerTarget.offsetHeight;
    const stickyTop = headerHeight + 1; // Add 1px to account for main header border

    document.querySelectorAll('.br-file-header').forEach(fileHeader => {
      const rect = fileHeader.getBoundingClientRect();
      const isSticky = rect.top <= stickyTop + 5; // Add small buffer for floating point precision

      if (isSticky) {
        // When sticky: rectangle shape, full borders, no top margin to prevent overlap
        fileHeader.style.borderRadius = '0';
        fileHeader.style.borderTop = '1px solid #d0d7de';
        fileHeader.style.marginTop = '0';
      } else {
        // When normal: rounded top corners, no top border (uses parent's border)
        fileHeader.style.borderRadius = '8px 8px 0 0';
        fileHeader.style.borderTop = 'none';
        fileHeader.style.marginTop = '';
      }
    });
  }

  // Stimulus action to manually trigger update (if needed)
  refresh() {
    this.updateStickyPositions();
  }
}
