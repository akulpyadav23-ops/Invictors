let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  console.warn('better-sqlite3 is not available in this environment. Continuing with Supabase cloud database.');
}
const path = require('path');
const fs = require('fs');

let db = null;

if (Database) {
  try {
    const isVercel = process.env.VERCEL || process.env.NOW_REGION;
    const dbPath = isVercel
      ? path.join('/tmp', 'final_override.db')
      : path.join(__dirname, '..', 'data', 'final_override.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);

    // Enable WAL mode for high performance concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initSchema();
  } catch (err) {
    console.warn('SQLite initialization skipped:', err.message);
  }
}

function initSchema() {
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE COLLATE NOCASE,
      coordinator TEXT COLLATE NOCASE,
      startedAt INTEGER NOT NULL,
      finishedAt INTEGER,
      stage INTEGER DEFAULT 1,
      penaltyMin INTEGER DEFAULT 0,
      pausedMs INTEGER DEFAULT 0,
      sessionToken TEXT UNIQUE,
      status TEXT DEFAULT 'active',
      isPaused INTEGER DEFAULT 0,
      teamPauseStartedAt INTEGER DEFAULT 0,
      tabSwitches INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      teamId TEXT NOT NULL,
      fullName TEXT NOT NULL,
      isLeader INTEGER NOT NULL DEFAULT 0,
      deviceToken TEXT,
      FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS progress (
      teamId TEXT NOT NULL,
      stage INTEGER NOT NULL,
      fragment TEXT,
      wrongAttempts INTEGER DEFAULT 0,
      hintsUsed INTEGER DEFAULT 0,
      solvedAt INTEGER,
      PRIMARY KEY (teamId, stage),
      FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teamId TEXT NOT NULL,
      stage INTEGER NOT NULL,
      valueHash TEXT,
      ok INTEGER NOT NULL,
      at INTEGER NOT NULL,
      FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teamId TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      at INTEGER NOT NULL,
      FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teamId TEXT NOT NULL,
      type TEXT NOT NULL,
      details TEXT,
      penaltyAdded INTEGER DEFAULT 0,
      at INTEGER NOT NULL,
      FOREIGN KEY (teamId) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrate existing tables if columns are missing
  try { db.exec("ALTER TABLE teams ADD COLUMN status TEXT DEFAULT 'active'"); } catch {}
  try { db.exec("ALTER TABLE teams ADD COLUMN isPaused INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE teams ADD COLUMN teamPauseStartedAt INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE teams ADD COLUMN tabSwitches INTEGER DEFAULT 0"); } catch {}

  // Ensure default settings exist
  const setStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setStmt.run('clockPaused', 'false');
  setStmt.run('pauseStartedAt', '0');
  setStmt.run('allowNewTeams', 'false');
  setStmt.run('eventStartedAt', '0');
  setStmt.run('totalPausedMs', '0');
  setStmt.run('startTogetherMode', 'true');
  setStmt.run('gameStarted', 'false');
  setStmt.run('winnersNotepad', '🏆 INVICTORS FINAL OVERRIDE — OFFICIAL WINNERS SCRATCHPAD\n=======================================================\n1st Place:\n2nd Place:\n3rd Place:\n\nSpecial Mentions:\nJudge Notes:\n');
}

initSchema();

module.exports = db;
