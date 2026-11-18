-- ============================================================================
-- FINAL OVERRIDE — SUPABASE POSTGRESQL SCHEMA
-- Run this SQL in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ============================================================================

-- 1. Teams Table
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  coordinator TEXT NOT NULL,
  "startedAt" BIGINT NOT NULL,
  "finishedAt" BIGINT,
  stage INTEGER DEFAULT 1,
  "penaltyMin" INTEGER DEFAULT 0,
  "pausedMs" BIGINT DEFAULT 0,
  "sessionToken" TEXT UNIQUE,
  status TEXT DEFAULT 'active',
  "isPaused" INTEGER DEFAULT 0,
  "teamPauseStartedAt" BIGINT DEFAULT 0,
  "tabSwitches" INTEGER DEFAULT 0
);

-- 2. Members Table
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  "fullName" TEXT NOT NULL,
  "isLeader" INTEGER DEFAULT 0,
  "deviceToken" TEXT
);

-- 3. Progress Table
CREATE TABLE IF NOT EXISTS progress (
  "teamId" TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  fragment TEXT,
  "wrongAttempts" INTEGER DEFAULT 0,
  "hintsUsed" INTEGER DEFAULT 0,
  "solvedAt" BIGINT,
  PRIMARY KEY ("teamId", stage)
);

-- 4. Submissions Table
CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  "valueHash" TEXT,
  ok INTEGER NOT NULL,
  at BIGINT NOT NULL
);

-- 5. Chat Table (WARDEN Logs)
CREATE TABLE IF NOT EXISTS chat (
  id BIGSERIAL PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  at BIGINT NOT NULL
);

-- 6. Violations Table (Anti-Cheat)
CREATE TABLE IF NOT EXISTS violations (
  id TEXT PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  details TEXT,
  "penaltyAdded" INTEGER DEFAULT 0,
  at BIGINT NOT NULL
);

-- 7. Settings Table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Insert Default Settings
INSERT INTO settings (key, value) VALUES
  ('clockPaused', 'false'),
  ('pauseStartedAt', '0'),
  ('allowNewTeams', 'false'),
  ('eventStartedAt', '0'),
  ('totalPausedMs', '0'),
  ('startTogetherMode', 'true'),
  ('gameStarted', 'false'),
  ('winnersNotepad', '🏆 INVICTORS FINAL OVERRIDE — OFFICIAL WINNERS SCRATCHPAD
=======================================================
1st Place:
2nd Place:
3rd Place:

Special Mentions:
Judge Notes:
')
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security (service_role secret key automatically bypasses RLS)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
