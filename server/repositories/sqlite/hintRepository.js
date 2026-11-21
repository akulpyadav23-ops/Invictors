const { getDb } = require('./dbConnection');

class SqliteHintRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  getAll() {
    return this.db.prepare('SELECT * FROM hints ORDER BY stage ASC, displayOrder ASC').all() || [];
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM hints WHERE id = ?').get(id) || null;
  }

  getByStage(stage) {
    return this.db.prepare('SELECT * FROM hints WHERE stage = ? AND enabled = 1 ORDER BY displayOrder ASC').all(stage) || [];
  }

  getByStageAndNumber(stage, hintNumber) {
    return this.db.prepare('SELECT * FROM hints WHERE stage = ? AND hintNumber = ?').get(stage, hintNumber) || null;
  }

  update(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);
    this.db.prepare(`UPDATE hints SET ${setClause} WHERE id = ?`).run(...values);
    return true;
  }

  // Record hint usage
  recordUsage({ teamId, stage, hintNumber, hintId, penaltyCharged, hintShownAt, hintVisibleUntil, idempotencyKey }) {
    this.db.prepare(`
      INSERT OR IGNORE INTO hint_usage (
        teamId, stage, hintNumber, hintId, penaltyCharged, hintShownAt, hintVisibleUntil, idempotencyKey
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      teamId, stage, hintNumber, hintId, penaltyCharged, hintShownAt, hintVisibleUntil, idempotencyKey || null
    );
  }

  getUsageByTeamAndStage(teamId, stage) {
    return this.db.prepare('SELECT * FROM hint_usage WHERE teamId = ? AND stage = ? ORDER BY hintNumber ASC').all(teamId, stage) || [];
  }

  getAllUsageForTeam(teamId) {
    return this.db.prepare('SELECT * FROM hint_usage WHERE teamId = ? ORDER BY stage ASC, hintNumber ASC').all(teamId) || [];
  }
}

module.exports = SqliteHintRepository;
