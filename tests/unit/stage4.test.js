const { test, describe } = require('node:test');
const assert = require('node:assert');
const terminalService = require('../../server/services/terminalService');

describe('Stage 4 Unit Tests (Terminal Virtual FS & Traversal Defense)', () => {
  test('Path traversal attempts are rejected safely with Access Denied', () => {
    const malicious = [
      'cat ../../etc/passwd',
      'cat ..\\windows\\system32',
      'cat /etc/shadow',
      'ls ../',
      'cat ./../../config.js'
    ];

    for (const cmd of malicious) {
      const output = terminalService.execute(cmd);
      assert.match(output, /Access denied/);
      assert.doesNotMatch(output, /root:/);
    }
  });

  test('Standard navigation and token extraction commands', () => {
    // 1. Help command
    const helpOutput = terminalService.execute('help');
    assert.match(helpOutput, /Commands: ls, ls <folder>, cat <file>, exif <file>, clear/);

    // 2. Root directory listing
    const lsOutput = terminalService.execute('ls');
    assert.match(lsOutput, /index\.html/);
    assert.match(lsOutput, /robots\.txt/);
    assert.match(lsOutput, /badge\.jpg/);

    // 3. Token 1 in index.html comment
    const catIndex = terminalService.execute('cat index.html');
    assert.match(catIndex, /token1 = 8/);

    // 4. Token 2 in vault note
    const catRobots = terminalService.execute('cat robots.txt');
    assert.match(catRobots, /vault-9e2b/);

    const catNote = terminalService.execute('cat vault-9e2b/note.txt');
    assert.match(catNote, /token2 = 2/);

    // 5. Token 3 in EXIF metadata
    const exifBadge = terminalService.execute('exif badge.jpg');
    assert.match(exifBadge, /token3 = K/);
  });
});
