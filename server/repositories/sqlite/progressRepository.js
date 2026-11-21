const { getDb } = require('./dbConnection');

class SqliteProgressRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  getByTeamId(teamId) {
    return this.db.prepare('SELECT * FROM progress WHERE teamId = ? ORDER BY stage ASC').all(teamId) || [];
  }

  getByTeamAndStage(teamId, stage) {
    return this.db.prepare('SELECT * FROM progress WHERE teamId = ? AND stage = ?').get(teamId, stage) || null;
  }

  getForTeams(teamIds) {
    if (!teamIds || teamIds.length === 0) return [];
    const placeholders = teamIds.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM progress WHERE teamId IN (${placeholders}) ORDER BY stage ASC`).all(...teamIds) || [];
  }

  initForTeam(teamId, totalStages = 5) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO progress (teamId, stage, fragment, wrongAttempts, hintsUsed, solvedAt)
      VALUES (?, ?, NULL, 0, 0, NULL)
    `);
    for (let s = 1; s <= totalStages; s++) {
      stmt.run(teamId, s);
    }
  }

  update(teamId, stage, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(teamId, stage);
    this.db.prepare(`UPDATE progress SET ${setClause} WHERE teamId = ? AND stage = ?`).run(...values);
    return true;
  }

  resetTeam(teamId, totalStages = 5) {
    this.db.prepare('DELETE FROM progress WHERE teamId = ?').run(teamId);
    this.initForTeam(teamId, totalStages);
  }
}

module.exports = SqliteProgressRepository;
