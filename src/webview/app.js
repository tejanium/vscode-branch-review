// Main application initialization and global state management
import { Application } from 'stimulus';
import AppController from './controllers/app_controller.js';
import BranchController from './controllers/branch_controller.js';
import CommentController from './controllers/comment_controller.js';
import CommentNavigationController from './controllers/comment_navigation_controller.js';
import FileController from './controllers/file_controller.js';
import SelectionController from './controllers/selection_controller.js';
import SearchController from './controllers/search_controller.js';

import StickyController from './controllers/sticky_controller.js';

// Initialize Stimulus application
const application = Application.start();

// Register all controllers
application.register('app', AppController);
application.register('branch', BranchController);
application.register('comment', CommentController);
application.register('comment-navigation', CommentNavigationController);
application.register('file', FileController);
application.register('selection', SelectionController);
application.register('search', SearchController);

application.register('sticky', StickyController);

// Global state initialization
const vscode = acquireVsCodeApi();
window.vscode = vscode;

// Global comment storage
window.commentStorage = [];

// Handle messages from extension
window.addEventListener('message', event => {
  const message = event.data;

  switch (message.command) {
    // Note: comments are handled by app_controller.js
    // This handler is kept for any future direct comment messages

    default:
    // Handle other messages
  }
});
