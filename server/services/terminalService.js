// Stage 4 Terminal Service: Secure Virtual Filesystem (Phase 4.5)
// Rejects "..", absolute paths, backslashes, and directory traversal attempts.

const { getMission } = require('../content/loader');

class TerminalService {
  constructor() {
    this.mission = getMission();
  }

  execute(rawCmd, team) {
    const cmd = (rawCmd || '').trim();
    if (!cmd) return '';

    const parts = cmd.split(/\s+/).filter(Boolean);
    const op = parts[0].toLowerCase();
    const target = parts[1] ? parts[1].toLowerCase().replace(/^\.?\//, '') : '';

    // Security path traversal checks
    const hasTraversal =
      cmd.includes('..') || cmd.includes('\\') || parts.some((p) => p.startsWith('/') || p.startsWith('~'));
    if (hasTraversal) {
      return 'Access denied: Path traversal and absolute paths are prohibited.';
    }

    const stage4Config = this.mission.stages['4'];
    const vfs = stage4Config.virtualFilesystem ? stage4Config.virtualFilesystem.files : {};

    if (op === 'help') {
      return 'Commands: ls, ls <folder>, cat <file>, exif <file>, clear';
    }

    if (op === 'ls') {
      if (!target) {
        return 'index.html robots.txt badge.jpg';
      }
      if (target === 'vault-9e2b' || target === 'vault-7f3a') {
        return 'note.txt';
      }
      return `ls: cannot access '${target}': No such file or directory`;
    }

    if (op === 'cat') {
      if (!target) return 'Usage: cat <filename>';

      if (target === 'robots.txt') {
        return vfs['robots.txt'] || 'User-agent: *\nDisallow: /vault-9e2b/';
      }

      if (target === 'index.html') {
        return vfs['index.html'] || '<!DOCTYPE html>\n<!-- token1 = 8 -->\n<html><body>Security Node</body></html>';
      }

      if (target.endsWith('note.txt')) {
        const noteContent = vfs['vault-9e2b/note.txt'] || vfs['vault-7f3a/note.txt'] || 'token2 = 2';
        return noteContent;
      }

      return `cat: ${target}: No such file or directory`;
    }

    if (op === 'exif') {
      if (!target) return 'Usage: exif <image-file>';
      if (target === 'badge.jpg') {
        const comment = stage4Config.tokens ? `token3 = ${stage4Config.tokens.token3}` : 'token3 = K';
        return `File: badge.jpg\nComment: ${comment}`;
      }
      return `exif: cannot read metadata for '${target}': File not found`;
    }

    if (op === 'clear') {
      return '__CLEAR__';
    }

    return `Command not recognized: '${op}'. Type 'help' for available commands.`;
  }
}

module.exports = new TerminalService();
