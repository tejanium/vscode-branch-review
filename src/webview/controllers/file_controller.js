// File Controller - Handles file opening and copying operations
import { Controller } from 'stimulus';

export default class FileController extends Controller {
  static values = { filePath: String };

  open() {
    window.vscode.postMessage({
      command: 'openFile',
      filePath: this.filePathValue,
    });
  }

  copy() {
    // Use the modern clipboard API if available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(this.filePathValue)
        .then(() => {
          this.showCopyFeedback();
        })
        .catch(() => {
          this.fallbackCopyToClipboard(this.filePathValue);
        });
    } else {
      this.fallbackCopyToClipboard(this.filePathValue);
    }
  }

  fallbackCopyToClipboard(text) {
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
      this.showCopyFeedback();
    } catch (err) {
      // Silent fail
    }

    document.body.removeChild(textArea);
  }

  showCopyFeedback() {
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

    setTimeout(() => (feedback.style.opacity = '1'), 10);
    setTimeout(() => {
      feedback.style.opacity = '0';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.parentNode.removeChild(feedback);
        }
      }, 300);
    }, 1500);
  }
}
