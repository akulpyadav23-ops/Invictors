/**
 * Build and Environment Validation Script
 * Verifies syntax, required assets, offline readiness (no external CDNs),
 * and 6-stage configuration integrity.
 */

const fs = require('fs');
const path = require('path');

console.log('=== RUNNING FINAL OVERRIDE BUILD VALIDATION ===');

let errors = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    errors++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Verify mission content files
const contentDir = path.join(__dirname, '..', 'server', 'content');
const missionPath = path.join(contentDir, 'mission.json');
const examplePath = path.join(contentDir, 'mission.example.json');

assert(fs.existsSync(missionPath), 'server/content/mission.json exists');
assert(fs.existsSync(examplePath), 'server/content/mission.example.json exists');

try {
  const mission = JSON.parse(fs.readFileSync(missionPath, 'utf-8'));
  const stageKeys = Object.keys(mission.stages || {});
  assert(stageKeys.length === 6, `mission.json has exactly 6 stages (found ${stageKeys.length})`);
  assert(mission.stages['5'] && mission.stages['5'].name === 'Team Sync', 'Stage 5 is named Team Sync');
  assert(mission.stages['6'] && mission.stages['6'].name === 'Final Integration', 'Stage 6 is named Final Integration');
  assert(
    Array.isArray(mission.stages['6'].machines) && mission.stages['6'].machines.length >= 2,
    'Stage 6 configures active machines'
  );
} catch (err) {
  assert(false, `mission.json is valid JSON: ${err.message}`);
}

try {
  const example = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
  const stageKeys = Object.keys(example.stages || {});
  assert(stageKeys.length === 6, `mission.example.json has exactly 6 stages (found ${stageKeys.length})`);
} catch (err) {
  assert(false, `mission.example.json is valid JSON: ${err.message}`);
}

// 2. Verify offline readiness: No CDN or remote scripts/fonts/icons in public/
const publicDir = path.join(__dirname, '..', 'public');
function scanDirForRemoteUrls(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      scanDirForRemoteUrls(full);
    } else if (f.name.endsWith('.html') || f.name.endsWith('.js') || f.name.endsWith('.css')) {
      const content = fs.readFileSync(full, 'utf-8');
      // Look for remote script/link tags
      const hasCdn = /(https?:)?\/\/(cdn\.|cdnjs\.|fonts\.googleapis|unpkg\.com|cdn\.jsdelivr)/i.test(content);
      assert(!hasCdn, `Offline check: ${path.relative(publicDir, full)} contains no remote CDNs`);
    }
  }
}
scanDirForRemoteUrls(publicDir);

// 3. Verify zero legacy Stage 6 patterns
const forbiddenPatterns = [
  new RegExp('F' + 'O' + '\\{'),
  new RegExp('\\bdigit' + ' sum\\b', 'i'),
  new RegExp('\\balphabetical' + ' order of the mission\\b', 'i'),
  new RegExp('\\breverse' + 'String\\b')
];

const dirsToScan = [
  path.join(__dirname, '..', 'server', 'services'),
  path.join(__dirname, '..', 'server', 'routes'),
  path.join(__dirname, '..', 'server', 'logic'),
  __dirname
];

for (const dir of dirsToScan) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'buildValidation.js');
  for (const file of files) {
    const full = path.join(dir, file);
    const content = fs.readFileSync(full, 'utf-8');
    for (const pat of forbiddenPatterns) {
      const match = content.match(pat);
      assert(!match, `Zero legacy pattern ${pat} in ${path.relative(path.join(__dirname, '..'), full)}`);
    }
  }
}

if (errors > 0) {
  console.error(`\n❌ BUILD VALIDATION FAILED WITH ${errors} ERRORS`);
  process.exit(1);
} else {
  console.log('\n🎉 ALL BUILD VALIDATIONS PASSED SUCCESSFULLY!');
  process.exit(0);
}
