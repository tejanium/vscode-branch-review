import { Controller } from 'stimulus'

export default class ModeToggleController extends Controller {
  static targets = ['branchBtn', 'workingBtn']

  connect() {
    // Don't modify the initial state - preserve what the renderer set
    // The renderer already set the correct active/inactive classes
  }

  changeMode(event) {
    const mode = event.currentTarget.dataset.mode

    // Don't update UI immediately - let the backend handle the re-rendering
    // This prevents race conditions between frontend updates and backend re-rendering

    // Send mode change to the extension
    if (typeof vscode !== 'undefined') {
      vscode.postMessage({
        command: 'changeMode',
        data: { newMode: mode }
      })
    }
  }

  updateModeDisplay(mode = null) {
    // Get current mode from parameter or button states
    const currentMode = mode || this.getCurrentMode()

    // Update button states if mode was provided
    if (mode) {
      this.updateButtonStates(currentMode)
    }

    // The title and content updates will be handled by the backend
    // when it re-renders the webview with the new mode
    // This controller only manages the toggle button states
  }

  updateButtonStates(mode) {
    // Clear all state classes first
    this.branchBtnTarget.classList.remove('active', 'inactive')
    this.workingBtnTarget.classList.remove('active', 'inactive')

    // Set new states
    if (mode === 'branch-compare') {
      this.branchBtnTarget.classList.add('active')
      this.workingBtnTarget.classList.add('inactive')
    } else {
      this.branchBtnTarget.classList.add('inactive')
      this.workingBtnTarget.classList.add('active')
    }
  }

  getCurrentMode() {
    // Check which button is currently active
    if (this.branchBtnTarget.classList.contains('active')) {
      return 'branch-compare'
    }
    if (this.workingBtnTarget.classList.contains('active')) {
      return 'working-changes'
    }
    return 'branch-compare' // default
  }

  // Called from app controller when mode is updated from the backend
  setMode(mode) {
    this.updateButtonStates(mode)
    this.updateModeDisplay(mode)
  }
}
