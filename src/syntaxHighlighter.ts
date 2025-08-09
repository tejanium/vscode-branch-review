import * as path from 'path';
import * as Prism from 'prismjs';

// Import all PrismJS language components (298+ languages)
// Using the official loader function with no arguments loads ALL languages
const loadLanguages = require('prismjs/components/');
loadLanguages(); // Load all 298+ languages

export class SyntaxHighlighter {
  // Add server-side syntax highlighting using PrismJS
  static addSyntaxHighlighting(content: string, filePath: string): string {
    // Get language from file extension
    const extension = path.extname(filePath).toLowerCase();
    let language = SyntaxHighlighter.getLanguageFromExtension(extension);

    try {
      // Escape HTML first for security
      const escapedContent = SyntaxHighlighter.escapeHtml(content);

      // If we have a supported language, apply Prism.js highlighting
      if (language && Prism.languages[language]) {
        const highlighted = Prism.highlight(content, Prism.languages[language], language);
        return highlighted;
      }

      // Fallback to escaped content without highlighting
      return escapedContent;
    } catch (error) {
      return SyntaxHighlighter.escapeHtml(content);
    }
  }

  private static getLanguageFromExtension(extension: string): string | null {
    const LANGUAGE_MAP: { [key: string]: string } = {
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.py': 'python',
      '.rb': 'ruby',
      '.php': 'php',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'bash',
      '.fish': 'bash',
      '.ps1': 'powershell',
      '.html': 'html',
      '.htm': 'html',
      '.xml': 'xml',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.cfg': 'ini',
      '.conf': 'ini',
      '.sql': 'sql',
      '.md': 'markdown',
      '.markdown': 'markdown',
      '.tex': 'latex',
      '.r': 'r',
      '.R': 'r',
      '.m': 'matlab',
      '.pl': 'perl',
      '.lua': 'lua',
      '.vim': 'vim',
      '.dockerfile': 'docker',
      '.Dockerfile': 'docker',
      '.makefile': 'makefile',
      '.Makefile': 'makefile',
      '.vue': 'javascript', // Vue files contain JavaScript
    };
    return LANGUAGE_MAP[extension] || null;
  }

  private static escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}
