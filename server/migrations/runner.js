const fs = require('fs');
const path = require('path');
const { getDb } = require('../repositories/sqlite/dbConnection');
const { getMission } = require('../content/loader');

function runMigrations(dbInstance = null) {
  const db = dbInstance || getDb();

  // Ensure schema_version table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_version').all();
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const migrationsDir = __dirname;
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const versionMatch = file.match(/^(\d+)_/);
    if (!versionMatch) continue;
    const version = parseInt(versionMatch[1], 10);

    if (!appliedSet.has(version)) {
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf-8');

      const tx = db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, Date.now());
      });
      tx();
    }
  }

  // Seed default settings and hints if empty
  seedDefaults(db);
}

function seedDefaults(db) {
  const setStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setStmt.run('clockPaused', 'false');
  setStmt.run('pauseStartedAt', '0');
  setStmt.run('allowNewTeams', 'false');
  setStmt.run('eventStartedAt', '0');
  setStmt.run('totalPausedMs', '0');
  setStmt.run('startTogetherMode', 'true');
  setStmt.run('gameStarted', 'false');
  setStmt.run('leaderboardFrozen', 'false');
  setStmt.run('winnersNotepad', 'Official Winners Scratchpad\n1st Place:\n2nd Place:\n3rd Place:\n');

  // Seed default hints from mission.json into hints table if empty
  const hintCountRow = db.prepare('SELECT COUNT(*) as c FROM hints').get();
  if (hintCountRow && hintCountRow.c === 0) {
    try {
      const mission = getMission();
      const insertHint = db.prepare(`
        INSERT OR IGNORE INTO hints (id, stage, hintNumber, moduleName, category, text, durationSeconds, penaltyMinutes, enabled, displayOrder)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);

      const stageKeys = Object.keys(mission.stages || {});
      for (const sStr of stageKeys) {
        const s = parseInt(sStr, 10);
        const stageConfig = mission.stages[sStr];
        if (stageConfig && stageConfig.hints) {
          stageConfig.hints.forEach((h, idx) => {
            const hId = `hint_s${s}_h${idx + 1}`;
            insertHint.run(
              hId,
              s,
              idx + 1,
              stageConfig.name,
              h.category || 'nudge',
              h.text,
              h.durationSeconds || 30,
              h.penaltyMinutes || (idx === 0 ? 3 : 5),
              idx + 1
            );
          });
        }
      }
    } catch (_) {}
  }
}

if (require.main === module) {
  console.log('Running database migrations...');
  runMigrations();
  console.log('✅ Migrations completed successfully.');
}

module.exports = {
  runMigrations,
  seedDefaults
};
