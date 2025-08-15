// Constants for the Branch Review extension

export const STORAGE_KEYS = {
  COMMENTS: 'branchReview.comments',
} as const;

export const MAIN_BRANCH_NAMES = ['trunk', 'main', 'master', 'develop'] as const;

export const COMMANDS = {
  START_REVIEW: 'branchReview.startReview',
  SUBMIT_COMMENTS: 'branchReview.submitComments',
  CLEAR_COMMENTS: 'branchReview.clearComments',
} as const;

export const WEBVIEW_COMMANDS = {
  ADD_COMMENT: 'addComment',
  UPDATE_COMMENT: 'updateComment',
  DELETE_COMMENT: 'deleteComment',
  DELETE_ALL_COMMENTS: 'deleteAllComments',
  LOAD_COMMENTS: 'loadComments',
  REFRESH_DIFF: 'refreshDiff',
  CHANGE_BRANCH: 'changeBranch',
  CHANGE_MODE: 'changeMode',
  SUBMIT_COMMENTS: 'submitComments',
  COMMENTS_UPDATED: 'commentsUpdated',
  UPDATE_LOADING_STATUS: 'updateLoadingStatus',
  HIDE_LOADING: 'hideLoading',
  SHOW_ERROR: 'showError',
  SHOW_WARNING: 'showWarning',
  OPEN_FILE: 'openFile',
  UPDATE_DIFF_STATS: 'updateDiffStats',
} as const;

export const REVIEW_MODES = {
  BRANCH_COMPARE: 'branch-compare',
  WORKING_CHANGES: 'working-changes',
} as const;

export const DEFAULT_CONFIG = {
  PROMPT_HEADER:
    '# Code Review Feedback\n\nI have reviewed the changes in this branch and have the following feedback:',
  PROMPT_FOOTER:
    "---\n\nPlease address these review comments and make the necessary changes. Once you've made the fixes, please commit the changes with an appropriate commit message. Let me know when you're done and I can review the updates.",
  PROMPT_FOOTER_WORKING_CHANGES:
    '---\n\nPlease address these review comments and make the necessary changes.',
} as const;

export const TEMP_FILE_PATTERNS = [
  'branch-review-temp',
  '.vscode/',
  '.git/',
  'node_modules/',
] as const;
