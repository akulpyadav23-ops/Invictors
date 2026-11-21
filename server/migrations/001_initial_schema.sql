-- Migration 001: Initial Complete Schema
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE COLLATE NOCASE,
  coordinator TEXT COLLATE NOCASE,
  memberCount INTEGER NOT NULL DEFAULT 3,
  startedAt INTEGER NOT NULL,
  finishedAt INTEGER,
  stage INTEGER DEFAULT 1,
  version INTEGER DEFAULT 1,
  penaltyMin INTEGER DEFAULT 0,
  pausedMs INTEGER DEFAULT 0,
  sessionToken TEXT UNIQUE,
  leaderRecoveryCode TEXT,
  leaderRecoveryExpiresAt INTEGER,
  status TEXT DEFAULT 'waiting',
  isPaused INTEGER DEFAULT 0,
  teamPauseStartedAt INTEGER DEFAULT 0,
  tabSwitches INTEGER DEFAULT 0,
  seed TEXT NOT NULL,
  stage1EnteredAt INTEGER,
  stage1OpensAt INTEGER,
  chartVisibleUntil INTEGER DEFAULT 0,
  stage2Order TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  fullName TEXT NOT NULL,
  isLeader INTEGER NOT NULL DEFAULT 0,
  deviceToken TEXT UNIQUE,
  assignedCodeType TEXT DEFAULT 'mixed',
  assignedShard TEXT,
  joinedAt INTEGER
);

CREATE TABLE IF NOT EXISTS progress (
  teamId TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  fragment TEXT,
  wrongAttempts INTEGER DEFAULT 0,
  hintsUsed INTEGER DEFAULT 0,
  solvedAt INTEGER,
  PRIMARY KEY (teamId, stage)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teamId TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  valueHash TEXT NOT NULL,
  rawValue TEXT,
  ok INTEGER NOT NULL,
  idempotencyKey TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hints (
  id TEXT PRIMARY KEY,
  stage INTEGER NOT NULL,
  hintNumber INTEGER NOT NULL,
  moduleName TEXT NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  durationSeconds INTEGER NOT NULL,
  penaltyMinutes INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  displayOrder INTEGER NOT NULL,
  UNIQUE(stage, hintNumber)
);

CREATE TABLE IF NOT EXISTS hint_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teamId TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  hintNumber INTEGER NOT NULL,
  hintId TEXT,
  penaltyCharged INTEGER NOT NULL,
  hintShownAt INTEGER NOT NULL,
  hintVisibleUntil INTEGER NOT NULL,
  idempotencyKey TEXT,
  UNIQUE(teamId, stage, hintNumber)
);

CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teamId TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS violations (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  type TEXT NOT NULL,
  details TEXT,
  penaltyAdded INTEGER DEFAULT 0,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS team_notes (
  teamId TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  notes TEXT,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  targetId TEXT,
  oldValue TEXT,
  newValue TEXT,
  at INTEGER NOT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
CREATE INDEX IF NOT EXISTS idx_teams_startedAt ON teams(startedAt);
CREATE INDEX IF NOT EXISTS idx_members_teamId ON members(teamId);
CREATE INDEX IF NOT EXISTS idx_members_deviceToken ON members(deviceToken);
CREATE INDEX IF NOT EXISTS idx_progress_teamId ON progress(teamId);
CREATE INDEX IF NOT EXISTS idx_submissions_teamId ON submissions(teamId);
CREATE INDEX IF NOT EXISTS idx_submissions_stage ON submissions(stage);
CREATE INDEX IF NOT EXISTS idx_chat_teamId_at ON chat(teamId, at);
CREATE INDEX IF NOT EXISTS idx_violations_teamId ON violations(teamId);
CREATE INDEX IF NOT EXISTS idx_hint_usage_teamId ON hint_usage(teamId);
