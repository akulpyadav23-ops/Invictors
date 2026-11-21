const { getDb } = require('./dbConnection');

class SqliteSubmissionRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  add({ teamId, stage, valueHash, rawValue, ok, idempotencyKey, at }) {
    this.db
      .prepare(
        `
      INSERT INTO submissions (teamId, stage, valueHash, rawValue, ok, idempotencyKey, at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(teamId, stage, valueHash, rawValue || null, ok ? 1 : 0, idempotencyKey || null, at || Date.now());
  }

  getByTeamId(teamId, limit = 50) {
    return (
      this.db
        .prepare(
          `
      SELECT id, teamId, stage, ok, at
      FROM submissions
      WHERE teamId = ?
      ORDER BY at DESC
      LIMIT ?
    `
        )
        .all(teamId, limit) || []
    );
  }

  // Admin dispute review only (raw values are never returned to non-admin endpoints)
  getRawSubmissionsForAdmin(teamId, limit = 100) {
    return (
      this.db
        .prepare(
          `
      SELECT id, teamId, stage, rawValue, ok, at
      FROM submissions
      WHERE teamId = ?
      ORDER BY at DESC
      LIMIT ?
    `
        )
        .all(teamId, limit) || []
    );
  }
}

module.exports = SqliteSubmissionRepository;
