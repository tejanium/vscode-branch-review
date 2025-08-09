// Selection Controller - Handles line selection for the table
import { Controller } from 'stimulus';
import { EVENTS, dispatchCustomEvent } from '../events.js';

export default class SelectionController extends Controller {
  static targets = ['selectableRow'];
  static values = {
    filePath: String,
  };

  // Local state for this table's line selection
  selectedLines = new Set();
  lastSelectedFile = null;
  lastSelectedLine = null;

  // Stimulus actions for handling requests
  handleSelectionRequest(event) {
    const { filePath, requestId } = event.detail;
    const selectedLines = this.getSelectedLinesForFile(filePath);

    // Emit response event on the same element
    dispatchCustomEvent(this.element, EVENTS.LINE_SELECTION.RESPONSE, {
      requestId,
      selectedLines,
    });
  }

  handleClearRequest(event) {
    this.clearAllSelections();
  }

  select(event) {
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

    const actualLineId = `${filePath}:new:${lineNumber}`;

    // Handle selection logic
    if (event.shiftKey && this.lastSelectedFile === filePath && this.lastSelectedLine !== null) {
      // Shift-click: select range
      const startLine = Math.min(this.lastSelectedLine, lineNumber);
      const endLine = Math.max(this.lastSelectedLine, lineNumber);

      this.clearSelections(filePath);

      for (let i = startLine; i <= endLine; i++) {
        const lineId = `${filePath}:new:${i}`;
        this.selectedLines.add(lineId);
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd-click: toggle individual line
      if (this.selectedLines.has(actualLineId)) {
        this.selectedLines.delete(actualLineId);
      } else {
        this.selectedLines.add(actualLineId);
      }
    } else {
      // Regular click: select only this line
      this.clearSelections(filePath);
      this.selectedLines.add(actualLineId);
    }

    this.updateSelectionStyling(filePath);

    if (this.selectedLines.has(actualLineId)) {
      this.lastSelectedFile = filePath;
      this.lastSelectedLine = lineNumber;
    }

    // Emit selection changed event
    dispatchCustomEvent(this.element, EVENTS.SELECTION.CHANGED, {
      filePath,
      selectedLines: this.getSelectedLinesForFile(filePath),
      lineCount: this.selectedLines.size,
    });
  }

  // Public API for other controllers
  clearAllSelections() {
    this.selectedLines.clear();
    this.lastSelectedFile = null;
    this.lastSelectedLine = null;
    // Remove visual styling from all rows using targets
    this.selectableRowTargets.forEach(row => {
      row.classList.remove(
        'br-line-selected',
        'br-line-selected-first',
        'br-line-selected-last',
        'br-line-selected-middle'
      );
    });
  }

  getSelectedLinesForFile(filePath) {
    return Array.from(this.selectedLines)
      .filter(line => line.startsWith(filePath + ':'))
      .filter(line => line.includes(':new:')) // Only new side lines
      .map(line => parseInt(line.split(':')[2])) // Get line number from file:new:line format
      .sort((a, b) => a - b);
  }

  clearSelections(filePath) {
    const selectedLines = this.selectedLines;
    selectedLines.forEach(id => {
      if (id.startsWith(filePath + ':')) {
        const prevRow = this.selectableRowTargets.find(
          row => row.getAttribute('data-line-id') === id
        );
        if (prevRow) {
          prevRow.classList.remove(
            'br-line-selected',
            'br-line-selected-first',
            'br-line-selected-last',
            'br-line-selected-middle'
          );
        }
        selectedLines.delete(id);
      }
    });
  }

  updateSelectionStyling(filePath) {
    // Find all new side rows for this file using targets
    const allRows = this.selectableRowTargets.filter(row => {
      const lineId = row.getAttribute('data-line-id');
      return lineId && lineId.startsWith(`${filePath}:new:`);
    });

    // First clear all selection styling classes from all rows
    allRows.forEach(row => {
      row.classList.remove(
        'br-line-selected',
        'br-line-selected-first',
        'br-line-selected-last',
        'br-line-selected-middle'
      );
    });

    // Get all selected new side lines for this file, sorted by line number
    const selectedLines = Array.from(this.selectedLines)
      .filter(id => id.startsWith(filePath + ':new:'))
      .map(id => {
        const lineNum = parseInt(id.split(':')[2]);
        const element = this.selectableRowTargets.find(
          row => row.getAttribute('data-line-id') === id
        );
        return { id, lineNum, element };
      })
      .filter(item => item.element) // Only keep items where we found the element
      .sort((a, b) => a.lineNum - b.lineNum);

    if (selectedLines.length === 0) return;

    // Apply styling for continuous borders
    selectedLines.forEach((item, index) => {
      const isFirst = index === 0;
      const isLast = index === selectedLines.length - 1;
      const isSingle = selectedLines.length === 1;

      // Always add the base selection class
      item.element.classList.add('br-line-selected');

      // Add border classes for continuous selection
      if (isSingle) {
        item.element.classList.add('br-line-selected-first', 'br-line-selected-last');
      } else if (isFirst) {
        item.element.classList.add('br-line-selected-first');
      } else if (isLast) {
        item.element.classList.add('br-line-selected-last');
      } else {
        item.element.classList.add('br-line-selected-middle');
      }
    });
  }
}
