const { getDb } = require('./dbConnection');

class SqliteAuditRepository {
  constructor(db = null) {
    this.db = db || getDb();
  }

  log({ actor, action, targetId, oldValue, newValue, at }) {
    this.db
      .prepare(
        `
      INSERT INTO audit_log (actor, action, targetId, oldValue, newValue, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        actor || 'system',
        action,
        targetId || null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        at || Date.now()
      );
  }

  getRecent(limit = 100) {
    return this.db.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT ?').all(limit) || [];
  }
}

module.exports = SqliteAuditRepository;
