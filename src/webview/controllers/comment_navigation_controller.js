// Comment Navigation Controller - Handles comment count and navigation
import { Controller } from 'stimulus';

export default class CommentNavigationController extends Controller {
  static targets = ['count', 'prevButton', 'nextButton'];

  connect() {
    this.currentCommentIndex = -1;
    this.comments = [];
    this.updateCommentData();
    this.setupEventListeners();

    // Also listen for DOM changes to catch new comments
    this.observer = new MutationObserver(() => {
      setTimeout(() => this.updateCommentData(), 100);
    });

    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
      this.observer.observe(mainContent, {
        childList: true,
        subtree: true,
      });
    }
  }

  disconnect() {
    this.removeEventListeners();
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  // Arrow function as class property for comments updated handler
  handleCommentsUpdated = () => {
    this.updateCommentData();
  };

  setupEventListeners() {
    // Listen for comment updates
    document.addEventListener('comments:updated', this.handleCommentsUpdated);
  }

  removeEventListeners() {
    document.removeEventListener('comments:updated', this.handleCommentsUpdated);
  }

  updateCommentData() {
    // Get all comment elements from the DOM
    this.comments = Array.from(document.querySelectorAll('.br-comment-display-row'));

    // Update count display
    if (this.hasCountTarget) {
      const count = this.comments.length;
      this.countTarget.textContent =
        count === 0 ? 'No comments' : `${count} comment${count === 1 ? '' : 's'}`;
    }

    // Update button states
    this.updateButtonStates();
  }

  updateButtonStates() {
    const hasComments = this.comments.length > 0;

    if (this.hasPrevButtonTarget) {
      this.prevButtonTarget.disabled = !hasComments;
    }

    if (this.hasNextButtonTarget) {
      this.nextButtonTarget.disabled = !hasComments;
    }
  }

  // Navigate to previous comment
  navigateToPrevious() {
    if (this.comments.length === 0) return;

    if (this.currentCommentIndex <= 0) {
      this.currentCommentIndex = this.comments.length - 1;
    } else {
      this.currentCommentIndex--;
    }

    this.scrollToCurrentComment();
  }

  // Navigate to next comment
  navigateToNext() {
    if (this.comments.length === 0) return;

    if (this.currentCommentIndex >= this.comments.length - 1) {
      this.currentCommentIndex = 0;
    } else {
      this.currentCommentIndex++;
    }

    this.scrollToCurrentComment();
  }

  scrollToCurrentComment() {
    if (this.currentCommentIndex < 0 || this.currentCommentIndex >= this.comments.length) return;

    const comment = this.comments[this.currentCommentIndex];

    // Remove previous highlight
    this.comments.forEach(c => c.classList.remove('br-comment-highlighted'));

    // Highlight current comment
    comment.classList.add('br-comment-highlighted');

    // Scroll to comment with offset for sticky headers
    const headerHeight = document.querySelector('.br-header')?.offsetHeight || 120;
    const fileHeaderHeight = 50; // Approximate file header height
    const offset = headerHeight + fileHeaderHeight + 20; // Extra padding

    const commentTop = comment.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({
      top: commentTop - offset,
      behavior: 'smooth',
    });

    // Remove highlight after a short delay
    setTimeout(() => {
      comment.classList.remove('br-comment-highlighted');
    }, 2000);
  }
}
