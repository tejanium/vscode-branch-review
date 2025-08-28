import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitService, FileDiff } from '../services/gitService';

/**
 * Test utilities for Branch Review integration tests
 *
 * These utilities provide mock implementations and test helpers that allow
 * testing the complete behavior of the extension without requiring actual
 * VSCode or Git repositories.
 */

export class TestGitRepository {
  private tempDir: string;
  private files: Map<string, string> = new Map();
  private branches: Map<string, Map<string, string>> = new Map();
  private currentBranch: string = 'main';

  constructor() {
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-review-test-'));
    this.initializeRepo();
  }

  private initializeRepo() {
    // Initialize main branch with some files
    const mainFiles = new Map([
      ['src/app.js', 'function main() {\n  console.log("Hello World");\n}'],
      ['README.md', '# Test Project\n\nThis is a test project.'],
      ['package.json', '{\n  "name": "test-project",\n  "version": "1.0.0"\n}'],
    ]);

    this.branches.set('main', mainFiles);
    this.files = new Map(mainFiles);
  }

  createBranch(branchName: string, fromBranch: string = 'main') {
    const sourceFiles = this.branches.get(fromBranch) || new Map();
    this.branches.set(branchName, new Map(sourceFiles));
  }

  switchToBranch(branchName: string) {
    const branchFiles = this.branches.get(branchName);
    if (!branchFiles) {
      throw new Error(`Branch ${branchName} does not exist`);
    }
    this.currentBranch = branchName;
    this.files = new Map(branchFiles);
  }

  commitCurrentState() {
    // Commit the current working directory state to the current branch
    this.branches.set(this.currentBranch, new Map(this.files));
  }

  modifyFile(filePath: string, content: string) {
    this.files.set(filePath, content);
    const branchFiles = this.branches.get(this.currentBranch);
    if (branchFiles) {
      branchFiles.set(filePath, content);
    }
  }

  addFile(filePath: string, content: string) {
    this.modifyFile(filePath, content);
  }

  deleteFile(filePath: string) {
    this.files.delete(filePath);
    const branchFiles = this.branches.get(this.currentBranch);
    if (branchFiles) {
      branchFiles.delete(filePath);
    }
  }

  getCurrentBranch(): string {
    return this.currentBranch;
  }

  getAllBranches(): string[] {
    return Array.from(this.branches.keys());
  }

  commitChanges(message: string): void {
    // Simulate committing changes by saving current state to the branch
    const branchFiles = this.branches.get(this.currentBranch) || new Map();

    // Copy all current files to the branch
    for (const [filePath, content] of this.files) {
      branchFiles.set(filePath, content);
    }

    this.branches.set(this.currentBranch, branchFiles);
  }

  getFileContent(filePath: string): string | undefined {
    return this.files.get(filePath);
  }

  getDiffBetweenBranches(baseBranch: string, targetBranch: string): FileDiff[] {
    const baseFiles = this.branches.get(baseBranch) || new Map();
    const targetFiles = this.branches.get(targetBranch) || new Map();

    const diffs: FileDiff[] = [];
    const allFiles = new Set([...baseFiles.keys(), ...targetFiles.keys()]);

    for (const filePath of allFiles) {
      const baseContent = baseFiles.get(filePath) || '';
      const targetContent = targetFiles.get(filePath) || '';

      if (baseContent !== targetContent) {
        let status: 'added' | 'modified' | 'deleted';
        if (!baseFiles.has(filePath)) {
          status = 'added';
        } else if (!targetFiles.has(filePath)) {
          status = 'deleted';
        } else {
          status = 'modified';
        }

        diffs.push({
          filePath,
          status,
          oldContent: baseContent,
          newContent: targetContent,
          hunks: this.generateHunks(baseContent, targetContent),
        });
      }
    }

    return diffs;
  }

  getWorkingDirectoryDiff(): FileDiff[] {
    // Simulate working directory changes by comparing current files with the committed branch state
    const committedFiles = this.branches.get(this.currentBranch) || new Map();
    const workingFiles = this.files; // Current working directory state

    const diffs: FileDiff[] = [];
    const allFiles = new Set([...committedFiles.keys(), ...workingFiles.keys()]);

    for (const filePath of allFiles) {
      const committedContent = committedFiles.get(filePath) || '';
      const workingContent = workingFiles.get(filePath) || '';

      if (committedContent !== workingContent) {
        let status: 'added' | 'modified' | 'deleted';
        if (!committedFiles.has(filePath)) {
          status = 'added';
        } else if (!workingFiles.has(filePath)) {
          status = 'deleted';
        } else {
          status = 'modified';
        }

        diffs.push({
          filePath,
          status,
          oldContent: committedContent,
          newContent: workingContent,
          hunks: this.generateHunks(committedContent, workingContent),
        });
      }
    }

    return diffs;
  }

  private generateHunks(oldContent: string, newContent: string) {
    // Simple hunk generation for testing
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    return [
      {
        oldStart: 1,
        oldLines: oldLines.length,
        newStart: 1,
        newLines: newLines.length,
        lines: newLines.map((line, index) => ({
          type: 'added' as const,
          content: line,
          oldLineNumber: undefined,
          newLineNumber: index + 1,
        })),
      },
    ];
  }

  cleanup() {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
  }

  getWorkspaceRoot(): string {
    return this.tempDir;
  }
}

export class MockGitService extends GitService {
  private testRepo: TestGitRepository;
  private mockHasUncommittedChanges: boolean = false;

  constructor(testRepo: TestGitRepository) {
    super();
    this.testRepo = testRepo;
  }

  setHasUncommittedChanges(hasChanges: boolean): void {
    this.mockHasUncommittedChanges = hasChanges;
  }

  async isGitRepository(workspaceRoot: string): Promise<boolean> {
    return true;
  }

  async getCurrentBranch(workspaceRoot: string): Promise<string> {
    return this.testRepo.getCurrentBranch();
  }

  async getMainBranch(workspaceRoot: string): Promise<string> {
    return 'main';
  }

  async getAllBranches(workspaceRoot: string): Promise<string[]> {
    return this.testRepo.getAllBranches();
  }

  async getDiffWithBranch(workspaceRoot: string, baseBranch: string): Promise<FileDiff[]> {
    return this.testRepo.getDiffBetweenBranches(baseBranch, this.testRepo.getCurrentBranch());
  }

  async getDiffWithMain(workspaceRoot: string): Promise<FileDiff[]> {
    return this.testRepo.getDiffBetweenBranches('main', this.testRepo.getCurrentBranch());
  }

  async hasUncommittedChanges(workspaceRoot: string): Promise<boolean> {
    return this.mockHasUncommittedChanges;
  }

  async getDiffWithWorkingDirectory(workspaceRoot: string): Promise<FileDiff[]> {
    // Simulate working directory changes by comparing current files with the committed state
    return this.testRepo.getWorkingDirectoryDiff();
  }

  async getWorkingChanges(workspaceRoot: string): Promise<FileDiff[]> {
    // Return empty for simplicity, can be extended for working changes tests
    return [];
  }
}

export class MockExtensionContext implements vscode.ExtensionContext {
  subscriptions: vscode.Disposable[] = [];
  workspaceState: vscode.Memento = new MockMemento();
  globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } =
    new MockMemento();
  extensionPath: string = '';
  extensionUri: vscode.Uri = vscode.Uri.file('');
  environmentVariableCollection: any = { getScoped: () => ({}) };
  extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Test;
  storageUri: vscode.Uri | undefined = undefined;
  globalStorageUri: vscode.Uri = vscode.Uri.file('');
  logUri: vscode.Uri = vscode.Uri.file('');
  secrets: vscode.SecretStorage = {} as any;
  extension: vscode.Extension<any> = {} as any;
  languageModelAccessInformation: vscode.LanguageModelAccessInformation = {} as any;
  storagePath: string | undefined = undefined;
  globalStoragePath: string = '/mock/global/storage';
  logPath: string = '/mock/log';

  asAbsolutePath(relativePath: string): string {
    return path.join(__dirname, '..', relativePath);
  }
}

export class MockMemento implements vscode.Memento {
  private storage = new Map<string, any>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.storage.get(key) ?? defaultValue;
  }

  async update(key: string, value: any): Promise<void> {
    this.storage.set(key, value);
  }

  keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }

  setKeysForSync(keys: readonly string[]): void {}
}

export class MockWebviewPanel implements vscode.WebviewPanel {
  webview: vscode.Webview;
  viewType: string = 'branchReview';
  title: string = 'Branch Review';
  iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
  options: vscode.WebviewPanelOptions & vscode.WebviewOptions = {};
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.One;
  active: boolean = true;
  visible: boolean = true;
  onDidDispose: vscode.Event<void> = new vscode.EventEmitter<void>().event;
  onDidChangeViewState: vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent> =
    new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>().event;

  private messages: any[] = [];

  constructor() {
    this.webview = new MockWebview();
  }

  reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void {}
  dispose(): void {}

  getMessages(): any[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }

  // Helper method for tests to get the last rendered HTML
  getLastHtml(): string {
    return this.webview.html;
  }
}

export class MockWebview implements vscode.Webview {
  options: vscode.WebviewOptions = {};
  html: string = '';
  cspSource: string = '';
  onDidReceiveMessage: vscode.Event<any> = new vscode.EventEmitter<any>().event;

  private messages: any[] = [];

  postMessage(message: any): Thenable<boolean> {
    this.messages.push(message);
    return Promise.resolve(true);
  }

  asWebviewUri(localResource: vscode.Uri): vscode.Uri {
    return localResource;
  }

  getMessages(): any[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }
}

/**
 * Helper function to create test comments with proper structure
 */
export function createTestComment(
  id: string,
  filePath: string,
  startLine: number,
  endLine: number,
  text: string,
  anchor?: any
) {
  return {
    id,
    filePath,
    startLine,
    endLine,
    text,
    codeSnippet: `Lines ${startLine}-${endLine}`,
    timestamp: new Date().toISOString(),
    anchor: anchor || {
      baseBranch: 'main',
      currentBranch: 'feature',
      lineContent: 'test content',
      contextLines: {
        before: [],
        after: [],
      },
      originalLineNumbers: {
        start: startLine,
        end: endLine,
      },
    },
    status: 'current' as const,
  };
}

/**
 * Helper function to create test file diffs
 */
export function createTestFileDiff(
  filePath: string,
  content: string,
  status: 'added' | 'modified' | 'deleted' = 'modified'
): FileDiff {
  return {
    filePath,
    status,
    oldContent: status === 'added' ? '' : 'old content',
    newContent: status === 'deleted' ? '' : content,
    hunks: [],
  };
}

/**
 * Helper function to wait for async operations in tests
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper function to assert that HTML contains expected structure
 */
export function assertValidHTML(html: string): void {
  if (!html.includes('<!doctype html>')) {
    throw new Error('HTML should start with doctype declaration');
  }
  if (!html.includes('<html')) {
    throw new Error('HTML should contain html tag');
  }
  if (!html.includes('<head>')) {
    throw new Error('HTML should contain head section');
  }
  if (!html.includes('<body>')) {
    throw new Error('HTML should contain body section');
  }
}

/**
 * Helper function to extract text content from HTML (simple version)
 */
export function extractTextFromHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
