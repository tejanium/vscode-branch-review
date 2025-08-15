/**
 * Mock VSCode API for standalone testing
 *
 * This module provides mock implementations of VSCode APIs that allow
 * our tests to run in a pure Node.js environment without requiring
 * the actual VSCode extension host.
 */

// Mock VSCode types and enums
export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
}

// Mock URI class
export class Uri {
  scheme: string;
  authority: string;
  path: string;
  query: string;
  fragment: string;

  constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
  }

  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }

  static parse(value: string): Uri {
    // Simple parse implementation for testing
    return new Uri('file', '', value, '', '');
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const path = require('path');
    const joinedPath = path.join(base.path, ...pathSegments);
    return new Uri(base.scheme, base.authority, joinedPath, base.query, base.fragment);
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }

  toJSON(): any {
    return {
      scheme: this.scheme,
      authority: this.authority,
      path: this.path,
      query: this.query,
      fragment: this.fragment,
    };
  }
}

// Mock EventEmitter
export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];

  get event() {
    return (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          const index = this.listeners.indexOf(listener);
          if (index >= 0) {
            this.listeners.splice(index, 1);
          }
        },
      };
    };
  }

  fire(data: T): void {
    this.listeners.forEach(listener => listener(data));
  }

  dispose(): void {
    this.listeners = [];
  }
}

// Mock interfaces
export interface Disposable {
  dispose(): void;
}

export interface Event<T> {
  (listener: (e: T) => void): Disposable;
}

export interface Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: any): Thenable<void>;
  keys(): readonly string[];
}

export interface SecretStorage {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
  onDidChange: Event<any>;
}

export interface ExtensionContext {
  subscriptions: Disposable[];
  workspaceState: Memento;
  globalState: Memento & { setKeysForSync(keys: readonly string[]): void };
  extensionPath: string;
  extensionUri: Uri;
  environmentVariableCollection: any;
  extensionMode: ExtensionMode;
  storageUri: Uri | undefined;
  globalStorageUri: Uri;
  logUri: Uri;
  secrets: SecretStorage;
  extension: any;
  languageModelAccessInformation: any;
  storagePath: string | undefined;
  globalStoragePath: string;
  logPath: string;
  asAbsolutePath(relativePath: string): string;
}

export interface WebviewOptions {
  enableScripts?: boolean;
  enableForms?: boolean;
  localResourceRoots?: Uri[];
  portMapping?: any[];
}

export interface WebviewPanelOptions {
  enableFindWidget?: boolean;
  retainContextWhenHidden?: boolean;
}

export interface Webview {
  options: WebviewOptions;
  html: string;
  cspSource: string;
  onDidReceiveMessage: Event<any>;
  postMessage(message: any): Thenable<boolean>;
  asWebviewUri(localResource: Uri): Uri;
}

export interface WebviewPanelOnDidChangeViewStateEvent {
  webviewPanel: WebviewPanel;
}

export interface WebviewPanel {
  webview: Webview;
  viewType: string;
  title: string;
  iconPath?: Uri | { light: Uri; dark: Uri };
  options: WebviewPanelOptions & WebviewOptions;
  viewColumn: ViewColumn;
  active: boolean;
  visible: boolean;
  onDidDispose: Event<void>;
  onDidChangeViewState: Event<WebviewPanelOnDidChangeViewStateEvent>;
  reveal(viewColumn?: ViewColumn, preserveFocus?: boolean): void;
  dispose(): void;
}

// Mock window and commands namespaces
export const window = {
  showErrorMessage: (message: string) => Promise.resolve(undefined),
  showInformationMessage: (message: string) => Promise.resolve(undefined),
  showWarningMessage: (message: string) => Promise.resolve(undefined),
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: ViewColumn,
    options?: WebviewPanelOptions & WebviewOptions
  ): WebviewPanel => {
    // Return a mock webview panel for testing
    return {} as WebviewPanel;
  },
};

export const commands = {
  registerCommand: (command: string, callback: (...args: any[]) => any) => {
    return { dispose: () => {} };
  },
  executeCommand: (command: string, ...rest: any[]) => Promise.resolve(),
};

export const workspace = {
  workspaceFolders: undefined as any,
  getConfiguration: (section?: string) => ({
    get: (key: string, defaultValue?: any) => defaultValue,
    has: (key: string) => false,
    inspect: (key: string) => undefined,
    update: (key: string, value: any) => Promise.resolve(),
  }),
};

// Export everything that our code might import from 'vscode'
export * from './vscode-mock';
