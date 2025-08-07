import * as vscode from "vscode";
import * as path from "path";
import { simpleGit, SimpleGit, DiffResult } from "simple-git";
import { MAIN_BRANCH_NAMES } from "./constants";

export interface FileDiff {
  filePath: string;
  status: "added" | "modified" | "deleted";
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export class GitService {
  private git: SimpleGit | undefined;

  async isGitRepository(workspaceRoot: string): Promise<boolean> {
    try {
      this.git = simpleGit(workspaceRoot);
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }

  async getCurrentBranch(workspaceRoot: string): Promise<string> {
    if (!this.git) {
      this.git = simpleGit(workspaceRoot);
    }

    const status = await this.git.status();
    return status.current || "HEAD";
  }

  async getMainBranch(workspaceRoot: string): Promise<string> {
    if (!this.git) {
      this.git = simpleGit(workspaceRoot);
    }

    try {
      console.log("Detecting main branch...");

      // Method 1: Try to get the default branch from git config
      try {
        const defaultBranch = await this.git.raw([
          "symbolic-ref",
          "refs/remotes/origin/HEAD",
        ]);
        if (defaultBranch) {
          const branchName = defaultBranch
            .trim()
            .replace("refs/remotes/origin/", "");
          console.log(`Found default branch from remote HEAD: ${branchName}`);
          return branchName;
        }
      } catch (e) {
        console.log("Could not get default branch from remote HEAD");
      }

      // Method 2: Check both local and remote branches for common names
      const [localBranches, remoteBranches] = await Promise.all([
        this.git.branch(["-l"]).catch(() => ({ all: [] })),
        this.git.branch(["-r"]).catch(() => ({ all: [] })),
      ]);

      const allBranches = [
        ...localBranches.all,
        ...remoteBranches.all.map((b) => b.replace("origin/", "")),
      ];

      console.log("Available branches:", allBranches);

      // Check for common main branch names (order matters - most likely first)
      for (const branchName of MAIN_BRANCH_NAMES) {
        if (allBranches.includes(branchName)) {
          console.log(`Found main branch: ${branchName}`);
          return branchName;
        }
      }

      // Method 3: Try to get the first branch that's not the current branch
      const currentBranch = await this.getCurrentBranch(workspaceRoot);
      const otherBranches = allBranches.filter(
        (b) => b !== currentBranch && !b.startsWith("origin/") && b !== "HEAD"
      );

      if (otherBranches.length > 0) {
        console.log(
          `Using first available branch as main: ${otherBranches[0]}`
        );
        return otherBranches[0];
      }

      // Fallback to trunk (since that's what the user uses)
      console.warn("Could not determine main branch, defaulting to trunk");
      return "trunk";
    } catch (error) {
      console.warn(
        "Could not determine main branch, defaulting to trunk:",
        error
      );
      return "trunk";
    }
  }

  async getAllBranches(workspaceRoot: string): Promise<string[]> {
    if (!this.git) {
      this.git = simpleGit(workspaceRoot);
    }

    try {
      // Get both local and remote branches
      const localBranches = await this.git.branch(["-l"]);
      const remoteBranches = await this.git.branch(["-r"]);

      // Combine all branches
      const allBranchNames = [...localBranches.all, ...remoteBranches.all];
      const branches = { all: allBranchNames };

      // Filter and clean branch names
      const branchList = branches.all
        .filter((branch) => {
          // Remove current branch indicator and whitespace
          const cleanBranch = branch.replace(/^\*?\s*/, "");
          // Skip HEAD and remote tracking info
          return (
            !cleanBranch.includes("HEAD") &&
            !cleanBranch.includes("->") &&
            cleanBranch.length > 0
          );
        })
        .map((branch) => {
          // Clean up branch names
          const cleanBranch = branch.replace(/^\*?\s*/, "");
          // Remove origin/ prefix from remote branches but keep the branch name
          return cleanBranch.replace(/^origin\//, "");
        })
        .filter((branch, index, arr) => {
          // Remove duplicates (local + remote of same branch)
          return arr.indexOf(branch) === index;
        })
        .sort();

      // Ensure we always have at least some branches
      if (branchList.length === 0) {
        console.warn("No branches found, using fallbacks");
        const currentBranch = await this.getCurrentBranch(workspaceRoot);
        const mainBranch = await this.getMainBranch(workspaceRoot);
        return [mainBranch, currentBranch].filter(
          (branch, index, arr) => arr.indexOf(branch) === index
        );
      }

      return branchList;
    } catch (error) {
      console.error("Error getting branch list:", error);
      // More robust fallback
      try {
        const currentBranch = await this.getCurrentBranch(workspaceRoot);
        const mainBranch = await this.getMainBranch(workspaceRoot);

        return [mainBranch, currentBranch].filter(
          (branch, index, arr) => arr.indexOf(branch) === index
        );
      } catch (fallbackError) {
        console.error("Fallback branch detection failed:", fallbackError);
        return ["trunk", "main", "master", "develop"]; // Final fallback
      }
    }
  }

  async getDiffWithBranch(
    workspaceRoot: string,
    baseBranch: string
  ): Promise<FileDiff[]> {
    if (!this.git) {
      this.git = simpleGit(workspaceRoot);
    }

    const currentBranch = await this.getCurrentBranch(workspaceRoot);

    try {
      // Get the diff between current branch and base branch
      const diffSummary = await this.git.diffSummary([
        `${baseBranch}...${currentBranch}`,
      ]);
      const fileDiffs: FileDiff[] = [];

      for (const file of diffSummary.files) {
        const filePath = file.file;
        let status: "added" | "modified" | "deleted" = "modified";

        // Type guard to check if file has insertions/deletions properties
        if ("insertions" in file && "deletions" in file) {
          if (file.insertions > 0 && file.deletions === 0) {
            status = "added";
          } else if (file.insertions === 0 && file.deletions > 0) {
            status = "deleted";
          }
        }

        // Get detailed diff for this file
        const detailedDiff = await this.git.diff([
          `${baseBranch}...${currentBranch}`,
          "--",
          filePath,
        ]);
        const hunks = this.parseDiff(detailedDiff);

        // Get file contents
        let oldContent = "";
        let newContent = "";

        try {
          if (status !== "added") {
            oldContent = await this.git.show([`${baseBranch}:${filePath}`]);
          }
          if (status !== "deleted") {
            newContent = await this.git.show([`${currentBranch}:${filePath}`]);
          }
        } catch (error) {
          // Handle case where file doesn't exist in one of the branches
          console.warn(`Could not get content for ${filePath}:`, error);
        }

        fileDiffs.push({
          filePath,
          status,
          oldContent,
          newContent,
          hunks,
        });
      }

      return fileDiffs;
    } catch (error) {
      console.error("Error getting diff:", error);
      throw error;
    }
  }

  async getDiffWithMain(workspaceRoot: string): Promise<FileDiff[]> {
    const mainBranch = await this.getMainBranch(workspaceRoot);
    return this.getDiffWithBranch(workspaceRoot, mainBranch);
  }

  private parseDiff(diffText: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lines = diffText.split("\n");

    let currentHunk: DiffHunk | null = null;
    let oldLineNumber = 0;
    let newLineNumber = 0;

    for (const line of lines) {
      // Parse hunk header: @@ -oldStart,oldLines +newStart,newLines @@
      const hunkMatch = line.match(
        /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
      );
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }

        const oldStart = parseInt(hunkMatch[1]);
        const oldLines = parseInt(hunkMatch[2] || "1");
        const newStart = parseInt(hunkMatch[3]);
        const newLines = parseInt(hunkMatch[4] || "1");

        currentHunk = {
          oldStart,
          oldLines,
          newStart,
          newLines,
          lines: [],
        };

        oldLineNumber = oldStart;
        newLineNumber = newStart;
        continue;
      }

      if (!currentHunk) continue;

      // Parse diff line
      if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "removed",
          content: line.substring(1),
          oldLineNumber: oldLineNumber++,
        });
      } else if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "added",
          content: line.substring(1),
          newLineNumber: newLineNumber++,
        });
      } else if (line.startsWith(" ")) {
        currentHunk.lines.push({
          type: "unchanged",
          content: line.substring(1),
          oldLineNumber: oldLineNumber++,
          newLineNumber: newLineNumber++,
        });
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }
}
