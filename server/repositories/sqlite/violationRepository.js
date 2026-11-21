const { getDb } = require('./dbConnection');
const crypto = require('crypto');

class SqliteViolationRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  add({ id, teamId, stage, type, details, penaltyAdded, at }) {
    const vId = id || crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO violations (id, teamId, stage, type, details, penaltyAdded, at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(vId, teamId, stage || 1, type, details || null, penaltyAdded || 0, at || Date.now());
  }

  getAll(limit = 100) {
    return this.db.prepare(`
      SELECT v.id, v.teamId, t.name as teamName, v.stage, v.type, v.details, v.penaltyAdded, v.at
      FROM violations v
      JOIN teams t ON v.teamId = t.id
      ORDER BY v.at DESC
      LIMIT ?
    `).all(limit) || [];
  }

  getByTeamId(teamId) {
    return this.db.prepare('SELECT * FROM violations WHERE teamId = ? ORDER BY at DESC').all(teamId) || [];
  }

  getRecentCount(teamId, stage, sinceTime) {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM violations WHERE teamId = ? AND stage = ? AND at > ?').get(teamId, stage, sinceTime);
    return row ? row.c : 0;
  }

  getTotalForStage(teamId, stage) {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM violations WHERE teamId = ? AND stage = ?').get(teamId, stage);
    return row ? row.c : 0;
  }

  delete(id) {
    this.db.prepare('DELETE FROM violations WHERE id = ?').run(id);
    return true;
  }
}

module.exports = SqliteViolationRepository;
