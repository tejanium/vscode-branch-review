// Line Controller - Handles individual line interactions (selection, comment buttons)
import { Controller } from 'stimulus';

export default class LineController extends Controller {
  static values = {
    filePath: String,
    lineNumber: Number,
  };

  select(event) {
    // Delegate to selection controller by dispatching event on the table
    const table = this.element.closest('table');
    if (table) {
      // Create a wrapper element with data-line-number for the selection controller
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-line-number', this.lineNumberValue.toString());

      // Create a synthetic event that the selection controller can handle
      const syntheticEvent = {
        target: wrapper,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
      };

      // Find selection controller on the table and call its select method
      const application = this.application;
      const selectionController = application.getControllerForElementAndIdentifier(
        table,
        'selection'
      );
      if (selectionController) {
        selectionController.select(syntheticEvent);
      }
    }
  }

  addComment(event) {
    // Prevent triggering the parent selection event
    event.stopPropagation();

    // Delegate to comment controller by dispatching event on the table
    const table = this.element.closest('table');
    if (table) {
      // Create a wrapper element with data-line-number for the comment controller
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-line-number', this.lineNumberValue.toString());

      const syntheticEvent = {
        target: wrapper,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
      };

      // Find comment controller on the table and call its addComment method
      const application = this.application;
      const commentController = application.getControllerForElementAndIdentifier(table, 'comment');
      if (commentController) {
        commentController.addComment(syntheticEvent);
      }
    }
  }
}
