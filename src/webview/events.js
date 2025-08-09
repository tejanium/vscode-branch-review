/**
 * Centralized registry for all custom events used in the application.
 * This file helps avoid magic strings and ensures consistency across controllers.
 *
 * NOTE: HTML data-action attributes in webview.html still use string literals
 * (e.g., data-action="comments:updated->app#handleCommentsUpdated")
 * These must be kept in sync with the constants defined here.
 */

export const EVENTS = {
  // Comment-related events
  COMMENTS: {
    UPDATED: 'comments:updated',
    UPDATED_FORWARDED: 'comments:updated-forwarded',
  },

  // Line selection events
  LINE_SELECTION: {
    REQUEST: 'line-selection:request',
    RESPONSE: 'line-selection:response',
    CLEAR: 'line-selection:clear',
  },

  // Selection change events
  SELECTION: {
    CHANGED: 'selection:changed',
  },
};

/**
 * Helper function to dispatch custom events with consistent structure
 * @param {Element} element - The element to dispatch the event from
 * @param {string} eventName - The event name (use EVENTS constants)
 * @param {object} detail - Optional event detail data
 * @param {object} options - Optional event options (bubbles, cancelable, etc.)
 */
export function dispatchCustomEvent(element, eventName, detail = {}, options = {}) {
  const event = new CustomEvent(eventName, {
    detail,
    bubbles: true,
    ...options,
  });

  element.dispatchEvent(event);
}

/**
 * Helper function to create event listener for custom events
 * @param {Element} element - The element to add listener to
 * @param {string} eventName - The event name (use EVENTS constants)
 * @param {Function} handler - The event handler function
 * @param {object} options - Optional listener options
 */
export function addCustomEventListener(element, eventName, handler, options = {}) {
  element.addEventListener(eventName, handler, options);
}

/**
 * Helper function to remove event listener for custom events
 * @param {Element} element - The element to remove listener from
 * @param {string} eventName - The event name (use EVENTS constants)
 * @param {Function} handler - The event handler function
 * @param {object} options - Optional listener options
 */
export function removeCustomEventListener(element, eventName, handler, options = {}) {
  element.removeEventListener(eventName, handler, options);
}
