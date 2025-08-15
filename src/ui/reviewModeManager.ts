import { GitService, FileDiff } from '../services/gitService';
import { REVIEW_MODES } from '../constants';

/**
 * Manages different review modes and their logic
 */
export class ReviewModeManager {
  private currentMode: 'branch-compare' | 'working-changes' = 'branch-compare';
  private currentBaseBranch: string = '';

  constructor(
    private gitService: GitService,
    private workspaceRoot: string
  ) {}

  getCurrentMode(): 'branch-compare' | 'working-changes' {
    return this.currentMode;
  }

  getCurrentBaseBranch(): string {
    return this.currentBaseBranch;
  }

  setMode(mode: 'branch-compare' | 'working-changes'): void {
    this.currentMode = mode;
  }

  setBaseBranch(branch: string): void {
    this.currentBaseBranch = branch;
  }

  async determineInitialMode(currentBranch: string): Promise<{
    mode: 'branch-compare' | 'working-changes';
    baseBranch: string;
    diff: FileDiff[];
    shouldShowError?: string;
    shouldShowWarning?: string;
  }> {
    // Detect main branch
    const mainBranch = await this.gitService.getMainBranch(this.workspaceRoot);
    this.currentBaseBranch = mainBranch;

    // Check if there are uncommitted changes
    const hasUncommittedChanges = await this.gitService.hasUncommittedChanges(this.workspaceRoot);

    // NEW LOGIC: Mode selection based on uncommitted changes
    if (hasUncommittedChanges) {
      // When there ARE uncommitted changes: Default to "Working Changes" mode
      this.currentMode = 'working-changes';
      const workingDiff = await this.gitService.getDiffWithWorkingDirectory(this.workspaceRoot);
      return {
        mode: 'working-changes',
        baseBranch: mainBranch,
        diff: workingDiff,
        // No warning needed - Working Changes is the correct mode for uncommitted changes
      };
    } else {
      // When there are NO uncommitted changes: Default to "Branch Compare" mode
      this.currentMode = 'branch-compare';

      // Handle special case: on main branch with no changes
      if (currentBranch === mainBranch) {
        return {
          mode: 'branch-compare',
          baseBranch: mainBranch,
          diff: [],
          shouldShowError: `You are already on the main branch (${mainBranch}). Please switch to a feature branch to start a review or make some uncommitted changes to review them.`,
        };
      }

      // Get branch diff for comparison
      const diff = await this.gitService.getDiffWithMain(this.workspaceRoot);

      if (diff.length === 0) {
        return {
          mode: 'branch-compare',
          baseBranch: mainBranch,
          diff: [],
          shouldShowError: 'No differences found between current branch and main branch',
        };
      }

      return { mode: 'branch-compare', baseBranch: mainBranch, diff };
    }
  }

  async switchMode(newMode: 'branch-compare' | 'working-changes'): Promise<FileDiff[]> {
    this.currentMode = newMode;

    if (newMode === 'working-changes') {
      return await this.gitService.getDiffWithWorkingDirectory(this.workspaceRoot);
    } else {
      return await this.gitService.getDiffWithBranch(this.workspaceRoot, this.currentBaseBranch);
    }
  }

  async switchBaseBranch(newBaseBranch: string): Promise<FileDiff[]> {
    this.currentBaseBranch = newBaseBranch;

    if (this.currentMode === 'working-changes') {
      return await this.gitService.getDiffWithWorkingDirectory(this.workspaceRoot);
    } else {
      return await this.gitService.getDiffWithBranch(this.workspaceRoot, newBaseBranch);
    }
  }
}
