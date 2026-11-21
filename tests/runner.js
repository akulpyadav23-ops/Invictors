process.env.NODE_ENV = 'test';
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { runMigrations } = require('../server/migrations/runner');

console.log('=== RUNNING FINAL OVERRIDE TEST SUITE ===');

// Ensure test database is migrated with all tables and default hints
runMigrations();

const testDirs = [path.join(__dirname, 'unit'), path.join(__dirname, 'integration')];

const testFiles = [];
for (const dir of testDirs) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js'));
    for (const f of files) {
      testFiles.push(path.join(dir, f));
    }
  }
}

if (testFiles.length === 0) {
  console.log('No test files found in tests/unit or tests/integration.');
  process.exit(0);
}

const args = ['--test', ...testFiles];
const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' }
});

if (result.status !== 0) {
  console.error(`Tests failed with exit code ${result.status}`);
  process.exit(result.status || 1);
}

console.log('=== ALL TESTS PASSED ===');
