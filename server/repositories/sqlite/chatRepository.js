const { getDb } = require('./dbConnection');

class SqliteChatRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  add({ teamId, role, text, at }) {
    this.db.prepare('INSERT INTO chat (teamId, role, text, at) VALUES (?, ?, ?, ?)').run(
      teamId, role, text, at || Date.now()
    );
  }

  getHistory(teamId) {
    return this.db.prepare('SELECT role, text, at FROM chat WHERE teamId = ? ORDER BY at ASC').all(teamId) || [];
  }

  getRecentCount(teamId, role, sinceTime) {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM chat WHERE teamId = ? AND role = ? AND at > ?').get(teamId, role, sinceTime);
    return row ? row.c : 0;
  }

  getRecentLogs(limit = 60) {
    return this.db.prepare(`
      SELECT c.id, c.teamId, t.name as teamName, c.role, c.text, c.at
      FROM chat c
      JOIN teams t ON c.teamId = t.id
      ORDER BY c.at DESC
      LIMIT ?
    `).all(limit) || [];
  }
}

module.exports = SqliteChatRepository;
